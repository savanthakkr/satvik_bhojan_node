const dbQuery = require("../helpers/query");
let constants = require("../vars/constants");
const utility = require('../helpers/utility');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const path = require("path");
const configPath = path.join(__dirname, "../config/smsConfig.json");

// tifin api
exports.adminLogin = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        const body = req?.body?.inputdata;

        // Validation messages
        const messages = {
            email: "Email is required.",
            password: "Password is required."
        };

        // Check required fields
        for (let key in messages) {
            if (!body[key] || body[key].trim() === "") {
                response.msg = messages[key];
                return utility.apiResponse(req, res, response);
            }
        }

        // Fetch admin
        const condition = `WHERE email = '${body.email}' AND is_active = 1 AND is_delete = 0`;
        const fields = "admin_id, name, email, password, mobile_no";

        const adminData = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "admins",
            condition,
            fields
        );

        if (!adminData || adminData.length === 0) {
            response.msg = "Admin not found.";
            return utility.apiResponse(req, res, response);
        }

        const admin = adminData;

        // ❌ PASSWORD CHECK (PLAIN TEXT)
        if (body.password !== admin.password) {
            response.msg = "Incorrect password.";
            return utility.apiResponse(req, res, response);
        }

        // Remove password before sending response
        delete admin.password;

        // Generate JWT token
        const token = jwt.sign(
            { admin_id: admin.admin_id, email: admin.email },
            "apiservice",
            { expiresIn: "7d" }
        );

        // Store token
        const tokenParams = {
            admin_id: admin.admin_id,
            admin_token_JWT: token,
            admin_token_Firebase: body?.firebase_token || "",
            created_at: req.locals.now,
            is_active: 1,
            is_delete: 0
        };

        await dbQuery.insertSingle(constants.vals.defaultDB, "admin_token", tokenParams);

        // Success response
        response.status = "success";
        response.msg = "Login successful.";
        response.data = {
            admin,
            token
        };

        return utility.apiResponse(req, res, response);

    } catch (error) {
        console.error("Admin login error:", error);
        return res.status(500).json({
            status: "error",
            msg: "Internal server error"
        });
    }
};




exports.adminGetProfile = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };

        // Read JWT token
        const token = req.headers["authorization"];

        if (!token) {
            response.msg = "Token missing.";
            return utility.apiResponse(req, res, response);
        }

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, "apiservice");
        } catch (err) {
            response.msg = "Invalid or expired token.";
            return utility.apiResponse(req, res, response);
        }

        // Fetch admin
        const condition = `WHERE admin_id = ${decoded.admin_id} AND is_active = 1 AND is_delete = 0`;
        const fields = "admin_id, name, email, mobile_no, created_at";

        const adminData = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "admins",
            condition,
            fields
        );

        if (!adminData || adminData.length === 0) {
            response.msg = "Admin not found.";
            return utility.apiResponse(req, res, response);
        }

        // Success response
        response.status = "success";
        response.msg = "Profile fetched successfully.";
        response.data = adminData;

        return utility.apiResponse(req, res, response);

    } catch (error) {
        console.error("Admin profile error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};


exports.addMeal = async (req, res) => {
    try {
        const body = req.body.inputdata;
        let response = { status: "error", msg: "" };

        if (!body.meals_name) {
            response.msg = "Meal name is required.";
            return utility.apiResponse(req, res, response);
        }
        if (!body.price) {
            response.msg = "Meal price is required.";
            return utility.apiResponse(req, res, response);
        }

        const params = {
            meals_name: body.meals_name,
            price: body.price,
            description: body.description || null,
            bread_count: body.bread_count || 0,
            subji_count: body.subji_count || 0,
            other_count: body.other_count || 0,
            is_special_meal: body.is_special_meal || 0,
            special_item_id: body.special_item_id || null,
            is_active: 1,
            is_delete: 0,
            created_at: req.locals.now
        };

        const insert = await dbQuery.insertSingle(constants.vals.defaultDB, "meals", params);
        const mealId = insert?.insertId || insert;

        response.status = "success";
        response.msg = "Meal added successfully.";
        response.data = { meal_id: mealId };

        return utility.apiResponse(req, res, response);
    }
    catch (error) {
        console.error("Add Meal Error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};




exports.getMeals = async (req, res) => {
    try {
        const condition = "WHERE is_delete = 0";
        const fields =
            "meals_id, meals_name, price, description, bread_count, subji_count, other_count, is_special_meal, special_item_id, is_active, created_at";

        const meals = await dbQuery.fetchRecords(
            constants.vals.defaultDB,
            "meals",
            condition,
            fields
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: "Meals fetched successfully.",
            data: meals
        });

    } catch (error) {
        console.error("Get Meals Error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};




exports.editMeal = async (req, res) => {
    try {
        const body = req.body.inputdata;
        let response = { status: "error", msg: "" };

        if (!body.meals_id) {
            response.msg = "Meal ID is required.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            meals_name='${body.meals_name}',
            price='${body.price}',
            description='${body.description || ""}',
            bread_count=${body.bread_count || 0},
            subji_count=${body.subji_count || 0},
            other_count=${body.other_count || 0},
            is_special_meal=${body.is_special_meal || 0},
            special_item_id=${body.special_item_id || null},
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "meals",
            `meals_id=${body.meals_id} AND is_delete=0`,
            updateValue
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: "Meal updated successfully."
        });

    } catch (error) {
        console.error("Edit Meal Error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};





exports.deleteMeal = async (req, res) => {
    try {
        const body = req.body.inputdata;
        if (!body.meals_id) {
            return utility.apiResponse(req, res, {
                status: "error",
                msg: "Meal ID is required."
            });
        }

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "meals",
            `meals_id=${body.meals_id}`,
            `is_delete=1, updated_at='${req.locals.now}'`
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: "Meal deleted successfully."
        });

    } catch (error) {
        console.error("Delete Meal Error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};


exports.toggleMealStatus = async (req, res) => {
    try {
        const body = req.body.inputdata;

        if (!body.meals_id) {
            return utility.apiResponse(req, res, { status: "error", msg: "Meal ID required." });
        }

        const status = body.is_active ? 1 : 0;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "meals",
            `meals_id=${body.meals_id}`,
            `is_active=${status}, updated_at='${req.locals.now}'`
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: `Meal ${status ? "Activated" : "Deactivated"} successfully.`
        });

    } catch (error) {
        console.error("Toggle Meal Status Error:", error);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};






exports.addBread = async (req, res) => {
    try {
        let body = req.body.inputdata;
        let response = { status: "error", msg: "" };

        if (!body.name) {
            response.msg = "Bread name is required.";
            return utility.apiResponse(req, res, response);
        }
        if (!body.price) {
            response.msg = "Bread price is required.";
            return utility.apiResponse(req, res, response);
        }

        const insertValue = {
            name: body.name.trim(),
            price: body.price,
            is_active: 1,
            is_delete: 0,
            created_at: req.locals.now
        };

        let insert = await dbQuery.insertSingle(constants.vals.defaultDB, "breads", insertValue);

        response.status = "success";
        response.msg = "Bread added successfully.";
        response.data = { bread_id: insert };

        return utility.apiResponse(req, res, response);
    } catch (err) { throw err; }
};





exports.getBread = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };

        const listQuery = `
            SELECT bread_id, name, price, is_active, is_delete, created_at
            FROM breads
            WHERE is_delete = 0
            ORDER BY bread_id DESC
        `;

        const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

        response.status = "success";
        response.msg = "Bread list fetched.";
        response.data = list;

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.editBread = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.bread_id) {
            response.msg = "Bread ID is required.";
            return utility.apiResponse(req, res, response);
        }

        if (!body.name || body.name.trim() === "") {
            response.msg = "Bread name is required.";
            return utility.apiResponse(req, res, response);
        }

        // Check record exists
        const bread = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${body.bread_id} AND is_delete=0`,
            "bread_id"
        );

        if (!bread) {
            response.msg = "Bread not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "breads",
            `bread_id=${body.bread_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Bread updated successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.deleteBread = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.bread_id) {
            response.msg = "Bread ID is required.";
            return utility.apiResponse(req, res, response);
        }

        const bread = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${body.bread_id} AND is_delete=0`,
            "bread_id"
        );

        if (!bread) {
            response.msg = "Bread not found.";
            return utility.apiResponse(req, res, response);
        }

        const date = req.locals.now;

        const updateValue = `
            is_delete=1,
            updated_at='${date}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "breads",
            `bread_id=${body.bread_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Bread deleted successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};

exports.toggleBreadStatus = async (req, res) => {
    try {
        const body = req.body.inputdata;

        if (!body.bread_id) {
            return utility.apiResponse(req, res, {
                status: "error",
                msg: "Bread ID is required."
            });
        }

        const isActive = body.is_active == 1 ? 1 : 0;

        const setCondition = `is_active=${isActive}, updated_at='${req.locals.now}'`;
        const whereCondition = `bread_id=${body.bread_id}`;

        // ✅ PARAMETER ORDER FIXED
        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "breads",
            whereCondition,   // WHERE
            setCondition      // SET
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: `Bread ${isActive === 1 ? "activated" : "deactivated"} successfully.`
        });

    } catch (err) {
        console.error("Toggle bread error:", err);
        return utility.apiResponse(req, res, {
            status: "error",
            msg: "Internal server error"
        });
    }
};







exports.addSubji = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req?.body?.inputdata;

        if (!body.price) {
            response.msg = "Subji price is required.";
            return utility.apiResponse(req, res, response);
        }

        const insertValue = {
            name: body.name.trim(),
            price: body.price,
            is_active: 1,
            is_delete: 0,
            created_at: req.locals.now
        };


        const insert = await dbQuery.insertSingle(constants.vals.defaultDB, "subjis", insertValue);

        response.status = "success";
        response.msg = "Subji added successfully.";
        response.data = { subji_id: insert };

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.getSubji = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };

        const listQuery = `
            SELECT subji_id, name, price, is_active, is_delete, created_at
            FROM subjis
            WHERE is_delete = 0
            ORDER BY subji_id DESC
        `;

        const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

        response.status = "success";
        response.msg = "Subji list fetched.";
        response.data = list;

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.editSubji = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.subji_id) {
            response.msg = "Subji ID is required.";
            return utility.apiResponse(req, res, response);
        }

        if (!body.name || body.name.trim() === "") {
            response.msg = "Subji name is required.";
            return utility.apiResponse(req, res, response);
        }

        const subji = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${body.subji_id} AND is_delete=0`,
            "subji_id"
        );

        if (!subji) {
            response.msg = "Subji not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;


        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "subjis",
            `subji_id=${body.subji_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Subji updated successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.deleteSubji = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.subji_id) {
            response.msg = "Subji ID is required.";
            return utility.apiResponse(req, res, response);
        }

        const subji = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${body.subji_id} AND is_delete=0`,
            "subji_id"
        );

        if (!subji) {
            response.msg = "Subji not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "subjis",
            `subji_id=${body.subji_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Subji deleted successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};

exports.toggleSubjiStatus = async (req, res) => {
    try {
        const body = req.body.inputdata;
        if (!body.subji_id) {
            return utility.apiResponse(req, res, { status: "error", msg: "Subji ID required." });
        }

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "subjis",
            `subji_id=${body.subji_id}`,
            `is_active=${body.is_active ? 1 : 0}, updated_at='${req.locals.now}'`
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: `Subji ${body.is_active ? "Activated" : "Deactivated"} successfully.`
        });

    } catch (err) { throw err; }
};



exports.addSpecialItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.price) {
            response.msg = "Special item price is required.";
            return utility.apiResponse(req, res, response);
        }

        const insertValue = {
            name: body.name.trim(),
            price: body.price,
            is_active: 1,
            is_delete: 0,
            created_at: req.locals.now
        };


        const insert = await dbQuery.insertSingle(
            constants.vals.defaultDB,
            "special_items",
            insertValue
        );

        response.status = "success";
        response.msg = "Special item added successfully.";
        response.data = { special_item_id: insert.insertId || insert };

        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.error("Add Special Item Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal error" });
    }
};




exports.getSpecialItems = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };

        const list = await dbQuery.rawQuery(
            constants.vals.defaultDB,
            `SELECT special_item_id, name, price, is_active, is_delete, created_at
            FROM special_items
            WHERE is_delete = 0
            ORDER BY special_item_id DESC`
        );

        response.status = "success";
        response.msg = "Special items fetched.";
        response.data = list;

        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.error("Get Special Items Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal error" });
    }
};




exports.editSpecialItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.special_item_id) {
            response.msg = "Special item ID is required.";
            return utility.apiResponse(req, res, response);
        }
        if (!body.name || body.name.trim() === "") {
            response.msg = "Special item name is required.";
            return utility.apiResponse(req, res, response);
        }

        const item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
            "special_item_id"
        );

        if (!item) {
            response.msg = "Special item not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;


        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "special_items",
            `special_item_id=${body.special_item_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Special item updated successfully.";
        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.error("Edit Special Item Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal error" });
    }
};





exports.deleteSpecialItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.special_item_id) {
            response.msg = "Special item ID is required.";
            return utility.apiResponse(req, res, response);
        }

        const item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
            "special_item_id"
        );

        if (!item) {
            response.msg = "Special item not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "special_items",
            `special_item_id=${body.special_item_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Special item deleted successfully.";
        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.error("Delete Special Item Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal error" });
    }
};


exports.toggleSpecialItemStatus = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.special_item_id) {
            response.msg = "Special item ID is required.";
            return utility.apiResponse(req, res, response);
        }
        if (typeof body.is_active === "undefined") {
            response.msg = "is_active (0 or 1) is required.";
            return utility.apiResponse(req, res, response);
        }

        const item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
            "special_item_id"
        );

        if (!item) {
            response.msg = "Special item not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            is_active=${body.is_active},
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "special_items",
            `special_item_id=${body.special_item_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = `Special item ${body.is_active == 1 ? "activated" : "deactivated"} successfully.`;

        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.error("Update Special Item Status Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal error" });
    }
};


exports.addOtherItem = async (req, res) => {
    try {
        let body = req.body.inputdata;
        let response = { status: "error", msg: "" };

        if (!body.name) {
            response.msg = "Item name is required.";
            return utility.apiResponse(req, res, response);
        }
        if (!body.price) {
            response.msg = "Item price is required.";
            return utility.apiResponse(req, res, response);
        }

        const insertValue = {
            name: body.name.trim(),
            price: body.price,
            is_active: 1,
            is_delete: 0,
            created_at: req.locals.now
        };

        let insert = await dbQuery.insertSingle(constants.vals.defaultDB, "other_items", insertValue);

        response.status = "success";
        response.msg = "Item added successfully.";
        response.data = { other_item_id: insert };

        return utility.apiResponse(req, res, response);
    } catch (err) { throw err; }
};




exports.getOtherItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };

        const listQuery = `
            SELECT other_item_id, name, price, is_active, is_delete, created_at
            FROM other_items
            WHERE is_delete = 0
            ORDER BY other_item_id DESC
        `;

        const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

        response.status = "success";
        response.msg = "Item list fetched.";
        response.data = list;

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.editOtherItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.other_item_id ) {
            response.msg = "Item ID is required.";
            return utility.apiResponse(req, res, response);
        }

        if (!body.name || body.name.trim() === "") {
            response.msg = "Item name is required.";
            return utility.apiResponse(req, res, response);
        }

        // Check record exists
        const otheritem = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "other_items",
            `WHERE other_item_id =${body.other_item_id } AND is_delete=0`,
            "other_item_id "
        );

        if (!otheritem) {
            response.msg = "Item not found.";
            return utility.apiResponse(req, res, response);
        }

        const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "other_items",
            `other_item_id=${body.other_item_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Item updated successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};



exports.deleteOtherItem = async (req, res) => {
    try {
        let response = { status: "error", msg: "" };
        let body = req.body.inputdata;

        if (!body.other_item_id) {
            response.msg = "Item ID is required.";
            return utility.apiResponse(req, res, response);
        }

        const otheritem = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "other_items",
            `WHERE other_item_id=${body.other_item_id} AND is_delete=0`,
            "other_item_id"
        );

        if (!otheritem) {
            response.msg = "Item not found.";
            return utility.apiResponse(req, res, response);
        }

        const date = req.locals.now;

        const updateValue = `
            is_delete=1,
            updated_at='${date}'
        `;

        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "other_items",
            `other_item_id=${body.other_item_id}`,
            updateValue
        );

        response.status = "success";
        response.msg = "Item deleted successfully.";

        return utility.apiResponse(req, res, response);

    } catch (err) { throw err; }
};

exports.toggleOtherItemStatus = async (req, res) => {
    try {
        const body = req.body.inputdata;

        if (!body.other_item_id) {
            return utility.apiResponse(req, res, {
                status: "error",
                msg: "Item ID is required."
            });
        }

        const isActive = body.is_active == 1 ? 1 : 0;

        const setCondition = `is_active=${isActive}, updated_at='${req.locals.now}'`;
        const whereCondition = `other_item_id=${body.other_item_id}`;

        // ✅ PARAMETER ORDER FIXED
        await dbQuery.updateRecord(
            constants.vals.defaultDB,
            "other_items",
            whereCondition,   // WHERE
            setCondition      // SET
        );

        return utility.apiResponse(req, res, {
            status: "success",
            msg: `Item ${isActive === 1 ? "activated" : "deactivated"} successfully.`
        });

    } catch (err) {
        console.error("Toggle Item error:", err);
        return utility.apiResponse(req, res, {
            status: "error",
            msg: "Internal server error"
        });
    }
};


exports.addMealStructure = async (req, res) => {
    try {
        const body = req.body.inputdata;
        let response = { status: "error", msg: "" };

        if (!body || !body.meals_id || !Array.isArray(body.structure)) {
            response.msg = "meals_id and structure[] are required.";
            return utility.apiResponse(req, res, response);
        }

        // First delete old structure (if editing)
        await dbQuery.deleteRecord(
            constants.vals.defaultDB,
            "meal_structure",
            `meals_id=${body.meals_id}`
        );

        // Insert new structure
        for (let item of body.structure) {
            await dbQuery.insertSingle(constants.vals.defaultDB, "meal_structure", {
                meals_id: body.meals_id,
                item_type: item.item_type,
                item_id: item.item_id,
                quantity: item.quantity
            });
        }

        response.status = "success";
        response.msg = "Meal structure updated.";
        return utility.apiResponse(req, res, response);

    } catch (err) {
        console.log("addMealStructure Error:", err);
        return res.status(500).json({ status: "error", msg: "Internal server error" });
    }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { date, slot } = req.query;

    let where = "1=1";
    if (date) where += ` AND os.delivery_date='${date}'`;
    if (slot) where += ` AND os.slot='${slot}'`;

    const orders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        os.order_schedule_id,
        os.delivery_date,
        os.slot,
        o.order_id,
        o.total_amount,
        o.is_paid,
        u.name AS user_name,
        u.mobile_no
      FROM order_schedule os
      JOIN orders o ON o.order_id = os.order_id
      JOIN users u ON u.user_id = o.user_id
      WHERE ${where}
      ORDER BY os.delivery_date ASC
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Orders fetched",
      data: orders
    });

  } catch (err) {
    console.error("ADMIN GET ORDERS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.adminSettlePayment = async (req, res) => {
  try {
    const { user_id, amount, mode } = req.body;

    if (!user_id || !amount || !mode) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "user_id, amount and mode are required"
      });
    }

    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "wallet_transactions",
      {
        user_id,
        type: "credit",
        amount,
        description: `Admin settlement (${mode})`
      }
    );

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE users
      SET wallet_balance = wallet_balance - ${amount}
      WHERE user_id = ${user_id}
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Payment settled successfully"
    });

  } catch (err) {
    console.error("ADMIN SETTLE PAYMENT ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};



exports.getKitchenSummary = async (req, res) => {
  try {
    const { date, slot } = req.query;

    if (!date || !slot) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Date and slot required"
      });
    }

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        oi.selected_items,
        oi.quantity AS meal_qty,
        m.bread_count,
        m.subji_count
      FROM order_schedule os
      JOIN orders o ON o.order_id=os.order_id AND o.status='active'
      JOIN order_items oi ON oi.order_item_id=os.order_item_id
      JOIN meals m ON m.meals_id=oi.meals_id
      WHERE os.delivery_date='${date}'
        AND os.slot='${slot}'
      `
    );

    const countMap = {
      bread: {},
      subji: {}
    };

    for (let r of rows) {
      const parsed = JSON.parse(r.selected_items || "{}");
      const selected = parsed.selected_items || {};
      const extras = parsed.extra_items || [];

      const mealQty = Number(r.meal_qty || 1);

      /* =========================
         🍞 BASE BREAD (MEAL)
      ========================= */
      if (selected.bread_id) {
        const totalBread =
          Number(r.bread_count || 0) * mealQty;

        countMap.bread[selected.bread_id] =
          (countMap.bread[selected.bread_id] || 0) + totalBread;
      }

      /* =========================
         🥗 BASE SUBJI (MEAL)
      ========================= */
      if (Array.isArray(selected.subji_ids) && selected.subji_ids.length) {
        const totalSubji =
          Number(r.subji_count || 0) * mealQty;

        const perSubji = totalSubji / selected.subji_ids.length;

        for (let sid of selected.subji_ids) {
          countMap.subji[sid] =
            (countMap.subji[sid] || 0) + perSubji;
        }
      }

      /* =========================
         ➕ EXTRA ITEMS
      ========================= */
      for (let ex of extras) {
        if (!countMap[ex.item_type]) continue;

        countMap[ex.item_type][ex.item_id] =
          (countMap[ex.item_type][ex.item_id] || 0) +
          Number(ex.quantity || 0);
      }
    }

    /* =========================
       RESOLVE NAMES
    ========================= */
    const result = [];

    for (let id in countMap.bread) {
      const b = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "breads",
        `WHERE bread_id=${id}`,
        "name"
      );
      if (b) {
        result.push({
          item_type: "bread",
          item_id: id,
          name: b.name,
          total_qty: countMap.bread[id]
        });
      }
    }

    for (let id in countMap.subji) {
      const s = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "subjis",
        `WHERE subji_id=${id}`,
        "name"
      );
      if (s) {
        result.push({
          item_type: "subji",
          item_id: id,
          name: s.name,
          total_qty: countMap.subji[id]
        });
      }
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Kitchen summary fetched",
      data: result
    });

  } catch (err) {
    console.error("KITCHEN SUMMARY ERROR", err);
    res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};






exports.getAdminDailyOrders = async (req, res) => {
  try {
    const { date, slot } = req.query;

    if (!date || !slot) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "date and slot required"
      });
    }

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        os.delivery_date,
        os.slot,
        os.status AS delivery_status,
        o.order_id,
        o.total_amount,
        o.is_paid,
        u.user_id,
        u.name AS user_name,
        u.mobile_no,
        ua.full_address,
        oi.quantity,
        oi.selected_items,
        m.meals_id,
        m.meals_name,
        m.bread_count,
        m.subji_count,
        m.other_count
      FROM order_schedule os
      JOIN orders o ON o.order_id=os.order_id AND o.status='active'
      JOIN users u ON u.user_id=o.user_id
      LEFT JOIN user_addresses ua ON ua.address_id=os.address_id
      JOIN order_items oi ON oi.order_item_id=os.order_item_id
      JOIN meals m ON m.meals_id=oi.meals_id
      WHERE os.delivery_date='${date}'
        AND os.slot='${slot}'
      ORDER BY o.order_id ASC
      `
    );

    const result = [];

    for (let r of rows) {
      const parsed = JSON.parse(r.selected_items || "{}");
      const selected = parsed.selected_items || {};
      const extras = parsed.extra_items || [];

      // 🍞 Bread
      let bread = null;
      if (selected.bread_id) {
        bread = await dbQuery.fetchSingleRecord(
          constants.vals.defaultDB,
          "breads",
          `WHERE bread_id=${selected.bread_id}`,
          "bread_id, name, price"
        );
      }

      // 🥗 Subjis
      let subjis = [];
      if (Array.isArray(selected.subji_ids)) {
        for (let sid of selected.subji_ids) {
          const s = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${sid}`,
            "subji_id, name, price"
          );
          if (s) subjis.push(s);
        }
      }

      result.push({
        order_id: r.order_id,
        delivery_date: r.delivery_date,
        slot: r.slot,
        delivery_status: r.delivery_status,

        user: {
          user_id: r.user_id,
          name: r.user_name,
          mobile: r.mobile_no
        },

        address: r.full_address,

        meal: {
          meal_id: r.meals_id,
          name: r.meals_name,
          quantity: r.quantity,
          structure: {
            bread_count: r.bread_count,
            subji_count: r.subji_count,
            other_count: r.other_count
          }
        },

        selected_items: {
          bread,
          subjis
        },

        extra_items: extras,

        payment: {
          total_amount: r.total_amount,
          is_paid: r.is_paid
        }
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Daily orders fetched",
      data: result
    });

  } catch (err) {
    console.error("ADMIN DAILY ORDER ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};




exports.getPendingPayments = async (req, res) => {
  const rows = await dbQuery.rawQuery(
    constants.vals.defaultDB,
    `
    SELECT 
      u.user_id,
      u.name,
      u.mobile_no,
      SUM(
        CASE 
          WHEN wt.type='debit' THEN wt.amount
          WHEN wt.type='credit' THEN -wt.amount
        END
      ) AS pending_amount
    FROM wallet_transactions wt
    JOIN users u ON u.user_id=wt.user_id
    GROUP BY wt.user_id
    HAVING pending_amount > 0
    `
  );

  return utility.apiResponse(req, res, {
    status: "success",
    data: rows
  });
};



// tifin api




