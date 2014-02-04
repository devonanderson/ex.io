
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var exio = require('../lib/exio.js');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser('abc123'));
app.use(express.session({ secret: 'abc123' }));
app.use(exio.middleware); //the exio middleware is required, put it wherever you want your request to end.
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

/*	initializes the app and get's socket.io to listen to the express server,
	you must pass the express app as well as the server */
exio = exio.create(app, {  
  	secret: 'abc123' //make sure you use the same secret you passed to the session middleware
}).listen(server);

//define route specific middleware
var middlewareSuccess = function (req, res, next) {
	console.log('This is the middleware');
	req.foo = 'bar'; //add persistent variables to the request

	next();
}

var endSuccess = function (req, res) {
	console.log('This is the end of the route');
	console.log(req.socketRoute); //you can get the route that the socket is using 
	console.log(req.foo); //variables attached through middleware can be accessed
	console.log(req.session); //you get the session along with anything else from the main app connect stack
	console.log(req.data) //access the passed data inside req.data;

	//You can access the socket at each step
	req.io.emit('success', {
		message: 'THIS'
	});
}

//routes are defined almost exactly like express and includes chainable middleware
exio.route('test:success', middlewareSuccess, endSuccess, null); //pass null as the last argument if you don't need an error handler

var middlewareError = function (req, res, next) {
	console.log('This is middleware with an error');

	req.err(new Error('This is an error')); //you can pass an error back to the error callback and end the stack
	return;
}

var endError = function (req, res) {
	console.log('You will never make it here');
}

var errorHandler = function (req, res) {
	console.log('I handled you error');
}

exio.route('test:error', middlewareError, endError, errorHandler); //pass an error handler that will be accessible in the request object

var triggerRoute = function (req, res) {
	var clientID = req.clientID; //the id of the connected socket is available;
	
	var data = {
		message: 'This route was triggered'
	};

	/* 	you can trigger routes from anywhere within Node and pass it data,
		this works very well when using user ID's to generate socket ID's  */
	exio.triggerRoute('test:triggerFinish', clientID, data); 
}

exio.route('test:triggerStart', triggerRoute, null);

var triggerCaught = function (req, res) {
	console.log('Caught the triggered route');
	console.log(req.data);

	req.io.emit('triggered', req.data); //everything available in a normal route is available in a triggered route
}

exio.route('test:triggerFinish', triggerCaught, null);

var disconnect = function (req, res) {
	var clientID = req.clientID;

	//you can also disconnect clients at any point with a clientID
	exio.disconnectClient(clientID, function (err) {
		console.log('I disconnected you');
	});
}

exio.route('test:disconnect', disconnect, null);
