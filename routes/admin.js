var express = require("express");
var apiMiddleware = require("../middlewares/api");
const {adminLogin,addMeal,getKitchenSummary,getPendingPayments,getAdminDailyOrders,adminSettlePayment,getAllOrders,toggleOtherItemStatus,deleteOtherItem,editOtherItem,getOtherItem,addOtherItem,toggleSpecialItemStatus,toggleSubjiStatus,toggleBreadStatus,toggleMealStatus,addMealStructure,addBread,getBread,editBread,deleteBread,addSubji,getSubji,editSubji,deleteSubji,addSpecialItem,getSpecialItems,editSpecialItem,deleteSpecialItem,getMeals,editMeal,deleteMeal,adminGetProfile } = require("../controllers/adminController");
const { adminAuthentication } = require('../middlewares/authentication');
const FileManager = require("../helpers/file_manager");
var app = express();

// Login
app.use("/login", apiMiddleware, adminLogin);

//
app.use("/get_admin_profile", apiMiddleware, adminAuthentication, adminGetProfile);


//
app.use("/get_kitchen_summary", apiMiddleware, adminAuthentication, getKitchenSummary);


//
app.use("/get_pending_payments", apiMiddleware, adminAuthentication, getPendingPayments);

//
app.use("/get_admin_daily_orders", apiMiddleware, adminAuthentication, getAdminDailyOrders);

//
app.use("/add/add_other_item", apiMiddleware, adminAuthentication, addOtherItem);

//
app.use("/get_other_item", apiMiddleware, adminAuthentication, getOtherItem);

//
app.use("/edit_other_item", apiMiddleware, adminAuthentication, editOtherItem);

//
app.use("/delete_other_item", apiMiddleware, adminAuthentication, deleteOtherItem);

//
app.use("/toggle_other_item_status", apiMiddleware, adminAuthentication, toggleOtherItemStatus);

// app.use("/createDatabase", apiMiddleware, createTenantDatabase);

// app.use("/addRegisterFields", apiMiddleware, addRegisterFields);


app.use("/add/add_meal", apiMiddleware, adminAuthentication, addMeal);


app.use("/admin_settle_payment", apiMiddleware, adminAuthentication, adminSettlePayment);


app.use("/get_all_orders", apiMiddleware, adminAuthentication, getAllOrders);


app.use("/toggle_bread_status", apiMiddleware, adminAuthentication, toggleBreadStatus);

app.use("/toggle_meal_status", apiMiddleware, adminAuthentication, toggleMealStatus);

app.use("/toggle_subji_status", apiMiddleware, adminAuthentication, toggleSubjiStatus);

app.use("/toggle_special_item_status", apiMiddleware, adminAuthentication, toggleSpecialItemStatus);


//
app.use("/get_meals", apiMiddleware, adminAuthentication, getMeals);

//
app.use("/edit_meal", apiMiddleware, adminAuthentication, editMeal);

//
app.use("/delete_meal", apiMiddleware, adminAuthentication, deleteMeal);


//
app.use("/add/add_bread", apiMiddleware, adminAuthentication, addBread);

//
app.use("/get_bread", apiMiddleware, adminAuthentication, getBread);

//
app.use("/edit_bread", apiMiddleware, adminAuthentication, editBread);

//
app.use("/delete_bread", apiMiddleware, adminAuthentication, deleteBread);


//
app.use("/add/add_subji", apiMiddleware, adminAuthentication, addSubji);

//
app.use("/get_subji", apiMiddleware, adminAuthentication, getSubji);

//
app.use("/delete_subji", apiMiddleware, adminAuthentication, deleteSubji);


//
app.use("/edit_subji", apiMiddleware, adminAuthentication, editSubji);

//
app.use("/add/add_special_item", apiMiddleware, adminAuthentication, addSpecialItem);

//
app.use("/delete_special_item", apiMiddleware, adminAuthentication, deleteSpecialItem);

//
app.use("/edit_Special_item", apiMiddleware, adminAuthentication, editSpecialItem);

//
app.use("/get_special_items", apiMiddleware, adminAuthentication, getSpecialItems);

//
app.use("/add/meal_structure", apiMiddleware, adminAuthentication, addMealStructure);


module.exports = app;