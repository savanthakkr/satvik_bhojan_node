const bcrypt = require('bcrypt');
const { responseHandler } = require('../helpers/utility');
const dbQuery = require("../helpers/query");
let constants = require("../vars/constants");
let { notFoundResponse } = require("../vars/apiResponse");
const utility = require('../helpers/utility');
const jwt = require('jsonwebtoken');
const FileManager = require("../helpers/file_manager");
const moment = require('moment-timezone');
const { log } = require('console');
const axios = require("axios");
const FIREBASE_API_KEY = "AIzaSyDVPHjZwCXmiMVUps0MucNzYko9a-AGcWQ";
const razorpay = require("../helpers/razorpay");
const crypto = require("crypto");

// tifin api start

// User register
exports.userRegister = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };

    body.email = body.email?.trim().toLowerCase() || "";
    body.mobile_no = body.mobile_no?.trim() || "";

    // -----------------------------
    // VALIDATIONS
    // -----------------------------
    if (utility.checkEmptyString(body.name)) {
      response.msg = "Name is required.";
      return utility.apiResponse(req, res, response);
    }

    if (utility.checkEmptyString(body.password)) {
      response.msg = "Password is required.";
      return utility.apiResponse(req, res, response);
    }

    if (utility.checkEmptyString(body.email) && utility.checkEmptyString(body.mobile_no)) {
      response.msg = "Email or Mobile number is required.";
      return utility.apiResponse(req, res, response);
    }

    // -----------------------------
    // CHECK DUPLICATE EMAIL
    // -----------------------------
    if (!utility.checkEmptyString(body.email)) {
      let emailExist = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `
                SELECT user_id FROM users
                WHERE LOWER(TRIM(email)) = '${body.email}'
                AND is_delete = 0
                LIMIT 1
                `
      );

      if (emailExist.length > 0) {
        response.msg = "Email already registered.";
        return utility.apiResponse(req, res, response);
      }
    }

    // -----------------------------
    // CHECK DUPLICATE MOBILE
    // -----------------------------
    if (!utility.checkEmptyString(body.mobile_no)) {
      let mobileExist = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `
                SELECT user_id FROM users
                WHERE TRIM(mobile_no) = '${body.mobile_no}'
                AND is_delete = 0
                LIMIT 1
                `
      );

      if (mobileExist.length > 0) {
        response.msg = "Mobile number already registered.";
        return utility.apiResponse(req, res, response);
      }
    }

    // -----------------------------
    // HASH PASSWORD
    // -----------------------------
    const hashedPassword = await bcrypt.hash(body.password, 10);

    // -----------------------------
    // INSERT USER
    // -----------------------------
    let userId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "users",
      {
        name: body.name,
        email: body.email || null,
        mobile_no: body.mobile_no || null,
        password: hashedPassword,
        firebase_token: "",
        is_active: 1,
        is_delete: 0,
        created_at: req.locals.now
      }
    );

    // -----------------------------
    // GENERATE JWT TOKEN FOR AUTO LOGIN
    // -----------------------------
    const token = jwt.sign(
      { user_id: userId, mobile_no: body.mobile_no },
      "apiservice",
      { expiresIn: "7d" }
    );

    // -----------------------------
    // STORE TOKEN IN `users.user_Token`
    // -----------------------------
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id=${userId}`,
      `
                user_Token='${token}',
                updated_at='${req.locals.now}'
            `
    );

    // -----------------------------
    // SUCCESS RESPONSE
    // -----------------------------
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "User registered successfully.",
      data: {
        user_id: userId,
        token
      }
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};




exports.userLogin = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    const body = req?.body?.inputdata;

    if (!body.mobile_no || !body.password) {
      response.msg = "Mobile number & password are required.";
      return utility.apiResponse(req, res, response);
    }

    // Fetch user
    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE mobile_no='${body.mobile_no}' AND is_delete=0 AND is_active=1`,
      "user_id, name, mobile_no, password"
    );

    if (!user) {
      response.msg = "User not found.";
      return utility.apiResponse(req, res, response);
    }

    // Compare password
    const passMatch = await bcrypt.compare(body.password, user.password);

    if (!passMatch) {
      response.msg = "Invalid password.";
      return utility.apiResponse(req, res, response);
    }

    // Generate token
    const token = jwt.sign(
      { user_id: user.user_id, mobile_no: user.mobile_no },
      "apiservice",
      { expiresIn: "7d" }
    );

    // Store token IN YOUR TABLE USER_TOKEN
    const updateValue = `
            user_Token='${token}',
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id=${user.user_id}`,
      updateValue
    );

    delete user.password;

    response.status = "success";
    response.msg = "Login successful.";
    response.data = {
      user,
      token
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("User Login Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};


exports.getUserProfile = async (req, res) => {
  try {
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    // -----------------------------
    // 1️⃣ Fetch user basic info
    // -----------------------------
    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      `
        user_id,
        name,
        email,
        mobile_no,
        is_active,
        created_at
      `
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    // -----------------------------
    // 2️⃣ Wallet calculation
    // -----------------------------
    const walletTxns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT type, amount
      FROM wallet_transactions
      WHERE user_id=${user_id}
      `
    );

    let wallet_balance = 0;

    for (let t of walletTxns) {
      if (t.type === "debit") wallet_balance += Number(t.amount);
      if (t.type === "credit") wallet_balance -= Number(t.amount);
    }

    // -----------------------------
    // 3️⃣ Default address (optional)
    // -----------------------------
    const address = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE user_id=${user_id} AND is_default=1`,
      `
        address_id,
        full_address,
        city,
        pincode
      `
    );

    // -----------------------------
    // ✅ Final response
    // -----------------------------
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Profile fetched",
      data: {
        user: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          mobile_no: user.mobile_no,
          is_active: user.is_active,
          created_at: user.created_at
        },
        wallet: {
          balance: wallet_balance.toFixed(2)
        },
        address: address || null
      }
    });

  } catch (err) {
    console.error("GET USER PROFILE ERROR", err);
    res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};


exports.userGetMeals = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = `
      meals_id,
      meals_name,
      price,
      description,
      bread_count,
      subji_count,
      other_count,
      is_special_meal,
      special_item_id,
      created_at
    `;

    const meals = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "meals",
      condition,
      fields
    );

    const finalMeals = meals.map(meal => {

      // ✅ SPECIAL MEAL RULES
      if (meal.is_special_meal == 1) {
        return {
          ...meal,
          selection_rules: {
            meal_type: "special",
            allow_special_item: true,
            special_item_required: true,

            allow_bread: false,
            bread_count: 0,

            allow_subji: false,
            subji_count: 0,

            allow_other_items: false,
            other_count: 0
          }
        };
      }

      // ✅ NORMAL MEAL RULES
      return {
        ...meal,
        selection_rules: {
          meal_type: "normal",

          allow_bread: meal.bread_count > 0,
          bread_count: meal.bread_count,

          allow_subji: meal.subji_count > 0,
          subji_count: meal.subji_count,

          allow_other_items: meal.other_count > 0,
          other_count: meal.other_count
        }
      };
    });

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meals fetched successfully.",
      data: finalMeals
    });

  } catch (error) {
    console.error("Get Meals Error:", error);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};


exports.userGetSubjiList = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = "subji_id, name, price, created_at";

    const list = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "subjis",
      condition,
      fields
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Subji list fetched.",
      data: list
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

exports.userGetBreadList = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = "bread_id, name, price, created_at";

    const list = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "breads",
      condition,
      fields
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Bread list fetched.",
      data: list
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

exports.getSpecialItems = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT special_item_id, name, price
             FROM special_items
             WHERE is_delete = 0 AND is_active = 1
             ORDER BY special_item_id DESC`
    );

    response.status = "success";
    response.msg = "Active special items fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("User Special Items Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.addUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    if (!body.full_address) {
      response.msg = "Full address is required.";
      return utility.apiResponse(req, res, response);
    }

    // If setting default → remove default from others
    if (body.is_default == 1) {
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "user_addresses",
        `user_id=${userId}`,
        `is_default=0`
      );
    }

    const params = {
      user_id: userId,
      address_title: body.address_title || null,
      full_address: body.full_address,
      landmark: body.landmark || null,
      city: body.city || null,
      state: body.state || null,
      pincode: body.pincode || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      is_default: body.is_default || 0,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    const insertId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "user_addresses",
      params
    );

    response.status = "success";
    response.msg = "Address added successfully.";
    response.data = { address_id: insertId };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Add Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.editUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    if (!body.address_id) {
      response.msg = "Address ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const record = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE address_id=${body.address_id} AND user_id=${userId} AND is_delete=0`,
      "address_id"
    );

    if (!record) {
      response.msg = "Address not found.";
      return utility.apiResponse(req, res, response);
    }

    if (body.is_default == 1) {
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "user_addresses",
        `user_id=${userId}`,
        `is_default=0`
      );
    }

    const updateValue = `
            address_title='${body.address_title || ""}',
            full_address='${body.full_address || ""}',
            landmark='${body.landmark || ""}',
            city='${body.city || ""}',
            state='${body.state || ""}',
            pincode='${body.pincode || ""}',
            latitude='${body.latitude || ""}',
            longitude='${body.longitude || ""}',
            is_default=${body.is_default || 0},
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `address_id=${body.address_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Address updated successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Edit Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.deleteUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    if (!body.address_id) {
      response.msg = "Address ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const exists = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE address_id=${body.address_id} AND user_id=${userId} AND is_delete=0`,
      "address_id"
    );

    if (!exists) {
      response.msg = "Address not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `address_id=${body.address_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Address deleted successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Delete Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



exports.listUserAddresses = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT address_id, address_title, full_address, landmark, city, state,
                    pincode, latitude, longitude, is_default, created_at
             FROM user_addresses
             WHERE user_id=${userId} AND is_delete=0
             ORDER BY is_default DESC, address_id DESC`
    );

    response.status = "success";
    response.msg = "Address list fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("List Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.addToCart = async (req, res) => {
  try {
    const body = req.body.inputdata || {};
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    if (!body.meal_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal ID required"
      });
    }

    const pick = r => Array.isArray(r) ? r[0] : r;

    // -----------------------------
    // Fetch Meal
    // -----------------------------
    const meal = pick(await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "meals",
      `WHERE meals_id=${body.meal_id}`,
      "meals_id, price, is_special_meal"
    ));

    if (!meal) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal not found"
      });
    }

    const mealQty = Number(body.meal_quantity || 1);
    const mealPrice = mealQty * Number(meal.price);

    let extraItems = [];
    let extraTotal = 0;

    // -----------------------------
    // EXTRA ITEMS LOGIC
    // -----------------------------
    if (Array.isArray(body.extra_items)) {
      for (let ex of body.extra_items) {

        let item = null;
        let type = null;

        // 🔴 SPECIAL MEAL → ONLY SPECIAL ITEMS
        if (meal.is_special_meal == 1) {

          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "special_item_id AS id, name, price"
          ));

          if (!item) {
            return utility.apiResponse(req, res, {
              status: "error",
              msg: "Only special items allowed with special meal"
            });
          }

          type = "special";
        }

        // 🟢 NORMAL MEAL → BREAD / SUBJI
        if (meal.is_special_meal == 0) {

          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "bread_id AS id, name, price"
          ));
          if (item) type = "bread";

          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${ex.item_id}`,
              "subji_id AS id, name, price"
            ));
            if (item) type = "subji";
          }

          if (!item) continue;
        }

        const qty = Number(ex.quantity || 1);
        const subtotal = qty * Number(item.price);

        extraItems.push({
          item_id: item.id,
          item_type: type,
          quantity: qty,
          price: item.price,
          subtotal
        });

        extraTotal += subtotal;
      }
    }

    const finalTotal = mealPrice + extraTotal;

    // -----------------------------
    // SAVE CART
    // -----------------------------
    const cartID = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "user_cart",
      {
        user_id,
        meal_id: body.meal_id,
        meal_quantity: mealQty,
        selected_items: JSON.stringify(body.selected_items || {}),
        extra_items: JSON.stringify(extraItems),
        total_price: finalTotal,
        created_at: req.locals.now,
        updated_at: req.locals.now
      }
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Item added",
      data: {
        cart_id: cartID,
        total_price: finalTotal
      }
    });

  } catch (err) {
    console.error("ADD CART ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};





exports.getCart = async (req, res) => {
  try {
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    const cartList = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_cart WHERE user_id=${user_id} ORDER BY cart_id DESC`
    );

    let finalCart = [];

    for (let c of cartList) {

      const selected = JSON.parse(c.selected_items || "{}");
      const extras = JSON.parse(c.extra_items || "[]");

      // -----------------------------
      // Meal
      // -----------------------------
      const meal = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "meals",
        `WHERE meals_id=${c.meal_id}`,
        "meals_id, meals_name, price, bread_count, subji_count, other_count, is_special_meal"
      );

      // -----------------------------
      // Selected Items
      // -----------------------------
      let bread = null;
      let subjis = [];
      let specialItem = null;

      if (meal.is_special_meal == 0) {

        if (selected.bread_id) {
          bread = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${selected.bread_id}`,
            "bread_id, name, price"
          );
        }

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

      } else {
        if (selected.special_item_id) {
          specialItem = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${selected.special_item_id}`,
            "special_item_id, name, price"
          );
        }
      }

      // -----------------------------
      // Extra Items
      // -----------------------------
      let extraItems = [];

      for (let ex of extras) {
        let item = null;

        if (ex.item_type === "bread") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "subji") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "special") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (!item) continue;

        extraItems.push({
          item_id: ex.item_id,
          item_type: ex.item_type,
          name: item.name,
          price: item.price,
          quantity: ex.quantity,
          subtotal: ex.subtotal
        });
      }

      finalCart.push({
        cart_id: c.cart_id,
        total_price: c.total_price,
        meal_quantity: c.meal_quantity,
        created_at: c.created_at,

        meal: {
          meal_id: meal.meals_id,
          name: meal.meals_name,
          price: meal.price,
          structure: {
            bread_count: meal.bread_count,
            subji_count: meal.subji_count,
            other_count: meal.other_count,
            is_special_meal: meal.is_special_meal
          }
        },

        selected_items: {
          bread,
          subjis,
          special_item: specialItem
        },

        extra_items: extraItems
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart fetched",
      data: finalCart
    });

  } catch (err) {
    console.error("GET CART ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};







exports.deleteCart = async (req, res) => {
  try {
    const body = req.body.inputdata;

    if (!body.cart_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart ID required."
      });
    }

    await dbQuery.deleteRecord(
      constants.vals.defaultDB,
      "user_cart",
      `cart_id=${body.cart_id}`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart deleted successfully."
    });

  } catch (err) {
    console.error("Delete Cart Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



exports.createOrder = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { address_id, slot, delivery_dates } = req.body.inputdata;

    if (!delivery_dates || !delivery_dates.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Delivery dates required"
      });
    }

    // 🔹 Fetch cart
    const cartItems = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_cart WHERE user_id=${user_id}`
    );

    if (!cartItems.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart is empty"
      });
    }

    // 🔹 Calculate total
    let totalAmount = 0;
    cartItems.forEach(c => {
      totalAmount += Number(c.total_price);
    });

    totalAmount = totalAmount * delivery_dates.length;

    // 🔹 Create DB Order (IMPORTANT)
    const order_id = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "orders",
      {
        user_id,
        order_type: delivery_dates.length > 1 ? "subscription" : "single",
        total_amount: totalAmount,
        is_paid: 0,
        status: "pending",
        created_at: req.locals.now
      }
    );

    if (!order_id) throw new Error("Order not created");

    // 🔹 Create Razorpay Order
    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `order_${order_id}`
    });

    // 🔹 Save Razorpay Order ID
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "orders",
      `order_id=${order_id}`,
      `razorpay_order_id='${razorpayOrder.id}'`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order created",
      data: {
        order_id,
        razorpay_order_id: razorpayOrder.id,
        amount: totalAmount,
        currency: "INR",
        key: "rzp_test_S0ysEwOgi9ZKUb"
      }
    });

  } catch (err) {
    console.error("CREATE ORDER ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};




exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const secret = "Hqbl27FSCC5em6EHEdDUhY2w";

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment verification failed"
      });
    }

    // ✅ PAYMENT VERIFIED → UPDATE ORDER
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "orders",
      `razorpay_order_id='${razorpay_order_id}'`,
      `
        is_paid=1,
        payment_status='paid',
        razorpay_payment_id='${razorpay_payment_id}',
        updated_at='${req.locals.now}'
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Payment successful"
    });

  } catch (err) {
    console.error("VERIFY PAYMENT ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};



exports.getMyOrders = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;

    const orders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        o.order_id,
        o.total_amount,
        o.order_type,
        o.is_paid,
        o.status,
        o.created_at,
        GROUP_CONCAT(os.delivery_date ORDER BY os.delivery_date) AS delivery_dates,
        MIN(os.slot) AS slot
      FROM orders o
      JOIN order_schedule os ON o.order_id = os.order_id
      WHERE o.user_id = ${user_id}
      GROUP BY o.order_id
      ORDER BY o.order_id DESC
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "My orders fetched",
      data: orders
    });

  } catch (err) {
    console.error("GET MY ORDERS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const body = req.body.inputdata || {};
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    if (!body.cart_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart ID required"
      });
    }

    const pick = (r) => Array.isArray(r) ? r[0] : r;

    // --------------------------------------------------
    // 1️⃣ FETCH EXISTING CART
    // --------------------------------------------------
    const cart = pick(await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_cart",
      `WHERE cart_id=${body.cart_id} AND user_id=${user_id}`,
      "*"
    ));

    if (!cart) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart not found"
      });
    }

    // --------------------------------------------------
    // 2️⃣ MEAL PRICE
    // --------------------------------------------------
    let mealPrice = 0;
    let mealQty = body.meal_quantity || cart.meal_quantity || 1;

    if (cart.meal_id) {
      const meal = pick(await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "meals",
        `WHERE meals_id=${cart.meal_id}`,
        "price"
      ));

      mealPrice = Number(meal.price) * Number(mealQty);
    }

    // --------------------------------------------------
    // 3️⃣ EXTRA ITEMS RECALCULATION
    // --------------------------------------------------
    let extraItems = [];
    let extraTotal = 0;

    if (Array.isArray(body.extra_items)) {

      for (let ex of body.extra_items) {

        let item = null;
        let type = null;

        item = pick(await dbQuery.fetchSingleRecord(
          constants.vals.defaultDB,
          "breads",
          `WHERE bread_id=${ex.item_id}`,
          "bread_id AS id, price"
        ));
        if (item) type = "bread";

        if (!item) {
          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${ex.item_id}`,
            "subji_id AS id, price"
          ));
          if (item) type = "subji";
        }

        if (!item) {
          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "special_item_id AS id, price"
          ));
          if (item) type = "special";
        }

        if (!item) continue;

        const qty = Number(ex.quantity || 1);
        const subtotal = qty * Number(item.price);

        extraItems.push({
          item_id: item.id,
          item_type: type,
          quantity: qty,
          price: item.price,
          subtotal
        });

        extraTotal += subtotal;
      }
    }

    // --------------------------------------------------
    // 4️⃣ FINAL TOTAL
    // --------------------------------------------------
    const finalTotal = mealPrice + extraTotal;

    // --------------------------------------------------
    // 5️⃣ UPDATE CART
    // --------------------------------------------------
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_cart",
      `cart_id=${body.cart_id}`,
      `
            meal_quantity=${mealQty},
            selected_items='${JSON.stringify(body.selected_items || {})}',
            extra_items='${JSON.stringify(extraItems)}',
            total_price=${finalTotal},
            updated_at='${req.locals.now}'
            `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart updated",
      data: {
        cart_id: body.cart_id,
        total_price: finalTotal
      }
    });

  } catch (err) {
    console.error("UPDATE CART ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};



exports.getOrderDetails = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { order_id } = req.query;

    if (!order_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Order ID required"
      });
    }

    // 🧾 order
    const order = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "orders",
      `WHERE order_id=${order_id} AND user_id=${user_id}`
    );

    if (!order) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Order not found"
      });
    }

    // 📆 schedules
    const schedules = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        os.delivery_date,
        os.slot,
        os.status,
        ua.full_address
      FROM order_schedule os
      LEFT JOIN user_addresses ua ON ua.address_id=os.address_id
      WHERE os.order_id=${order_id}
      `
    );

    // 🍽 items
    const itemsRaw = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        oi.*,
        m.meals_name,
        m.bread_count,
        m.subji_count
      FROM order_items oi
      LEFT JOIN meals m ON m.meals_id=oi.meals_id
      WHERE oi.order_id=${order_id}
      `
    );

    let items = [];

    for (let it of itemsRaw) {

      const config = JSON.parse(it.selected_items || "{}");
      const selected = config.selected_items || {};
      const extras = config.extra_items || [];

      // 🫓 bread
      let bread = null;
      if (selected.bread_id) {
        bread = await dbQuery.fetchSingleRecord(
          constants.vals.defaultDB,
          "breads",
          `WHERE bread_id=${selected.bread_id}`,
          "bread_id, name, price"
        );
      }

      // 🍛 subjis
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

      // ➕ extra items
      let extra_items = [];

      for (let ex of extras) {
        let row = null;

        if (ex.item_type === "bread") {
          row = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "subji") {
          row = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (!row) continue;

        extra_items.push({
          name: row.name,
          price: row.price,
          quantity: ex.quantity,
          subtotal: ex.subtotal
        });
      }

      items.push({
        order_item_id: it.order_item_id,
        quantity: it.quantity,
        price: it.price,
        meal: {
          name: it.meals_name,
          bread_count: it.bread_count,
          subji_count: it.subji_count
        },
        selected_items: {
          bread,
          subjis
        },
        extra_items
      });
    }

    // 💳 wallet
    const wallet_transactions = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT type, amount, description, created_at
      FROM wallet_transactions
      WHERE order_id=${order_id}
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order details fetched",
      data: {
        order,
        schedules,
        items,
        wallet_transactions
      }
    });

  } catch (err) {
    console.error("ORDER DETAILS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};






exports.cancelOrder = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { order_id } = req.body.inputdata;

    const order = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "orders",
      `WHERE order_id=${order_id} AND user_id=${user_id} AND status='active'`
    );

    if (!order) {
      return utility.apiResponse(req, res, { status: "error", msg: "Order not found" });
    }

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE order_schedule
      SET status='cancelled'
      WHERE order_id=${order_id}
        AND delivery_date >= CURDATE()
      `
    );

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE orders
      SET status='cancelled', cancelled_at=NOW()
      WHERE order_id=${order_id}
      `
    );

    if (order.is_paid == 0) {
      await dbQuery.insertSingle(constants.vals.defaultDB, "wallet_transactions", {
        user_id,
        order_id,
        type: "credit",
        amount: order.total_amount,
        description: "Order cancelled refund"
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order cancelled"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};







exports.getWallet = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;

    const txns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT *
      FROM wallet_transactions
      WHERE user_id=${user_id}
      ORDER BY created_at DESC
      `
    );

    let balance = 0;
    for (let t of txns) {
      if (t.type === 'credit') balance -= Number(t.amount);
      if (t.type === 'debit') balance += Number(t.amount);
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Wallet fetched",
      data: {
        balance: balance.toFixed(2),
        transactions: txns
      }
    });

  } catch (err) {
    console.error("GET WALLET ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



exports.payWallet = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { amount, transaction_id } = req.body.inputdata;

    await dbQuery.insertSingle(constants.vals.defaultDB, 'payments', {
      user_id,
      payment_type: 'order',
      transaction_id,
      amount,
      payment_status: 'completed',
      payment_date: req.locals.now
    });

    await dbQuery.insertSingle(constants.vals.defaultDB, 'wallet_transactions', {
      user_id,
      type: 'credit',
      amount,
      description: 'Wallet payment (online)'
    });

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE users
      SET wallet_balance = wallet_balance - ${amount}
      WHERE user_id=${user_id}
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Wallet payment successful"
    });

  } catch (err) {
    console.error("PAY WALLET ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



// tifin api end

