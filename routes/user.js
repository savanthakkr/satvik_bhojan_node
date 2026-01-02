var express = require("express");
var apiMiddleware = require("../middlewares/api");
const {getUserProfile,getMyOrders,payWallet,getWallet,cancelOrder,createOrder, userLogin, userRegister,deleteCart,listUserAddresses,getSpecialItems,userGetMeals,userGetSubjiList,userGetBreadList,getOrderDetails,addToCart,getCart,addUserAddress, editUserAddress, deleteUserAddress, } = require("../controllers/UserController");
const { authentication } = require('../middlewares/authentication');
const FileManager = require("../helpers/file_manager");

var app = express();

// tifin app routs start

// User register route
app.use("/register", apiMiddleware, userRegister);

// User otp verify route
app.use("/user_login", apiMiddleware, userLogin);


// 
app.use("/get_user_profile", apiMiddleware, authentication, getUserProfile);

// 
app.use("/get_my_orders", apiMiddleware, authentication, getMyOrders);

// 
app.use("/pay_wallet", apiMiddleware, authentication, payWallet);

// 
app.use("/get_wallet", apiMiddleware, authentication, getWallet);

// 
app.use("/cancel_order", apiMiddleware, authentication, cancelOrder);

// 
app.use("/get_meals", apiMiddleware, authentication, userGetMeals);

// 
app.use("/get_subji_list", apiMiddleware, authentication, userGetSubjiList);

// 
app.use("/get_bread_list", apiMiddleware, authentication, userGetBreadList);

// 
app.use("/get_special_items", apiMiddleware, authentication, getSpecialItems);

// User Address route
app.use("/add_address", apiMiddleware, authentication, addUserAddress);

//
app.use("/delete_address", apiMiddleware, authentication, deleteUserAddress);

//
app.use("/edit_address", apiMiddleware, authentication, editUserAddress);


//
app.use("/list_address", apiMiddleware, authentication, listUserAddresses);


//
app.use("/delete_cart", apiMiddleware, authentication, deleteCart);

//
app.use("/add_cart", apiMiddleware, authentication, addToCart);

//
app.use("/get_cart", apiMiddleware, authentication, getCart);

//
app.use("/create_order", apiMiddleware, authentication, createOrder);

//
app.use("/get_order_details", apiMiddleware, authentication, getOrderDetails);

// tifin app routes end







module.exports = app;