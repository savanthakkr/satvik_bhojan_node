/**
 * MySQL Client – Stable & Production Safe
 */

const Promise = require('bluebird');
const mysql = require('mysql2');

const dbs = require('../vars/db').dbs;
const dbs_login = require('../vars/db').dbs_login;
const constants = require('../vars/constants');
const utility = require('../helpers/utility');

let pools = {};

/**
 * Base DB configuration
 */
const base = {
    host: 'localhost',            // ✅ IPv4 only (important on macOS)
    user: 'root',
    password: '',
    database: undefined,
    port: 3307,                   // ✅ XAMPP MySQL port
    connectionLimit: 50,
    multipleStatements: true,
    dateStrings: true,
    typeCast(field, next) {
        if (field.type === 'BIT' && field.length === 1) {
            const bit = field.string();
            return bit === null ? null : bit.charCodeAt(0);
        }
        return next();
    }
};

/**
 * Initialize DB pools
 */
exports.connection = async () => {
    return new Promise((resolve, reject) => {
        try {
            if (utility.checkEmpty(dbs)) {
                return resolve({});
            }

            Object.keys(dbs).forEach((dbKey) => {
                const cfg = dbs[dbKey];

                const commonConfig = {
                    ...base,
                    database: cfg.database,
                    host: cfg.read || base.host,
                    port: cfg.port || base.port
                };

                // Service based credentials (if exists)
                if (
                    !utility.checkEmpty(constants.vals.service_name) &&
                    !utility.checkEmpty(dbs_login[constants.vals.service_name])
                ) {
                    commonConfig.user = dbs_login[constants.vals.service_name].user;
                    commonConfig.password = dbs_login[constants.vals.service_name].password;
                }

                const readPoolConfig = {
                    ...commonConfig,
                    host: cfg.read || base.host
                };

                const writePoolConfig = {
                    ...commonConfig,
                    host: cfg.write || base.host
                };

                pools[dbKey] = {
                    read: mysql.createPool(readPoolConfig),
                    write: mysql.createPool(writePoolConfig)
                };
            });

            // expose globally
            constants.vals.dbconn = pools;

            console.log('✅ MySQL pools initialized');
            resolve(pools);

        } catch (err) {
            console.error('❌ MySQL pool init failed', err);
            reject(err);
        }
    });
};

/**
 * Execute query
 */
exports.query = async (database, qry, params = []) => {
    return new Promise((resolve, reject) => {

        if (utility.checkEmpty(constants.vals.dbconn) ||
            utility.checkEmpty(constants.vals.dbconn[database])) {
            return reject(new Error(`DB pool not initialized: ${database}`));
        }

        let queryType = 'write';

        qry = typeof qry === 'string' ? qry.trim() : '';

        if (qry.toLowerCase().startsWith('select')) {
            queryType = 'read';
        }

        const pool = constants.vals.dbconn[database][queryType];

        if (!pool) {
            return reject(new Error(`Pool not found for ${database} (${queryType})`));
        }

        pool.getConnection((err, connection) => {
            if (err) {
                console.error('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                console.error(mysql.format(qry, params));
                console.error('------------------------------------------------------------------------------------------------');
                console.error('DB CONNECTION ERROR:', err);
                return reject(err);
            }

            connection.query(qry, params, (err, result) => {
                connection.release();

                if (err) {
                    console.error('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                    console.error(mysql.format(qry, params));
                    console.error('------------------------------------------------------------------------------------------------');
                    console.error('QUERY ERROR:', err);
                    return reject(err);
                }

                resolve(result);
            });
        });
    });
};
