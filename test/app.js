
/**
 * Module dependencies.
 */

var express = require('express')
,	routes = require('./routes')
,	http = require('http')
,	path = require('path')
,	ionize = require('../lib/ionize.js');

var app = express()
,	bodyParser = require('body-parser')
,	methodOverride = require('method-override')
,	cookieParser = require('cookie-parser')
,	session = require('express-session');

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded())
app.use(methodOverride());
app.use(cookieParser('abc123'));
app.use(session({ secret: 'abc123' }));
app.use(ionize.middleware()); //the ionize middleware is required, put it wherever you want your request to end.
app.use(express.static(path.join(__dirname, 'public')));
app.use(function (err, req, res, next) { });

app.get('/', routes.index);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

/*	initializes the app and get's socket.io to listen to the express server,
	you must pass the express app as well as the server */
ionize.create(app, {  
  	secret: 'abc123' //make sure you use the same secret you passed to the session middleware
}).listen(server);

//routes are defined almost exactly like express and includes chainable middleware
ionize.set('test:success', 
function (req, res, next) { //define route specific middleware
	
	console.log('Ionize: This is the middleware for the test:success route');
	req.foo = 'bar'; //add persistent variables to the request

	next();
}, 
function (req, res) {

	console.log('Ionize: This is the end of the test:success route');
	console.log('Ionize: The route is ' + req.socketRoute); //you can get the route that the socket is using 
	console.log('Ionize: req.foo = ' + req.foo); //variables attached through middleware can be accessed
	console.log('Ionize: req.session ='); //you get the session along with anything else from the main app connect stack
	console.log(req.session);
	console.log('Ionize: req.body =') //access the passed data inside req.body;
	console.log(req.body);

	//You can access the socket at each step
	req.io.emit('success', {
		message: 'THIS LINE OF TEXT.'
	});
}); //pass null as the last argument if you don't need an error handler

ionize.set('test:error', 
function (req, res, next) {

	console.log('Ionize: This is middleware with an error');
	
	next(new Error());
}, 
function (req, res) {

	console.log('Ionize: You will never make it here');
}); //pass an error handler that will be accessible in the request object


ionize.set('test:triggerStart', 
function (req, res) {

	var data = {
		message: 'Ionize: this is from a triggered route test:triggerFinish'
	};

	/* 	you can trigger routes from anywhere and pass it data */
	ionize.trigger('test:triggerFinish', req.io, data); 
});

ionize.set('test:triggerFinish', 
function (req, res) {

	console.log('Ionize: Caught the triggered route test:triggerFinish');
	console.log(req.body);

	req.io.emit('triggered', req.body); //everything available in a normal route is available in a triggered route
});
