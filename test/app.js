
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var ionize = require('../lib/ionize.js');

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
app.use(ionize.middleware()); //the ionize middleware is required, put it wherever you want your request to end.
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.errorHandler());

app.get('/', routes.index);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

/*	initializes the app and get's socket.io to listen to the express server,
	you must pass the express app as well as the server */
ionize.create(app, {  
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
	console.log(req.body) //access the passed data inside req.body;

	//You can access the socket at each step
	req.io.emit('success', {
		message: 'THIS'
	});
}

//routes are defined almost exactly like express and includes chainable middleware
ionize.route('test:success', middlewareSuccess, endSuccess); //pass null as the last argument if you don't need an error handler

var middlewareError = function (req, res, next) {
	console.log('This is middleware with an error');
	next(new Error('This makes it to the error handler'))
}

var endError = function (req, res) {
	console.log('You will never make it here');
}

ionize.route('test:error', middlewareError, endError); //pass an error handler that will be accessible in the request object

var triggerRoute = function (req, res) {
	var clientID = req.clientID; //the id of the connected socket is available;
	
	var data = {
		message: 'This route was triggered'
	};

	/* 	you can trigger routes from anywhere within Node and pass it data */
	ionize.triggerRoute('test:triggerFinish', clientID, data); 
}

ionize.route('test:triggerStart', triggerRoute);

var triggerCaught = function (req, res) {
	console.log('Caught the triggered route');
	console.log(req.body);

	req.io.emit('triggered', req.body); //everything available in a normal route is available in a triggered route
}

ionize.route('test:triggerFinish', triggerCaught);

var disconnect = function (req, res) {
	var clientID = req.clientID;

	//you can also disconnect clients at any point with a clientID
	ionize.disconnectClient(clientID, function (err) {
		console.log('I disconnected you');
	});
}

ionize.route('test:disconnect', disconnect);
