ionize
=====

Node module that provides full-integration for Socket.io into Express using only exposed Express API methods. Provides Express like routing, pushing socket requests through the Express main middleware stack as well as allowing middleware definitions at the route level. Provides socket client management with the ability to define custom ID's for each socket. Also provides a wrapper around Socket.io's built in Redis store for integration into production environments.

#### Getting started:

Ionize is still in Alpha, and not yet available on npm. Clone this repo into your project root, then 

```
npm install ./ionize
```

Then in your app.js file

```
var express = require('express')
  , http = require('http')
  , ionize = require('ionize')();
  
var app = express();
  
app.set(...);
app.set(...);
app.set(...);
app.set(express.cookieParser('abc123');
app.set(express.session({ secret: 'abc123' }));
app.set(ionize.middleware); //place ionize middleware wherever you want the request to end and move on to the route
app.set(app.router) //ionize middleware must be placed above the app.router

var server = http.createServer(app).listen(3000);

//minimum needed for ex.io to work
ionize = ionize.create(app, {
  secret: 'abc123' 
}).listen(server);

ionize.route('myRoute', middleware, middleware, function (req, res) {
  console.log(req.socketRoute); //you can get the route that the socket is using 
  console.log(req.session); //you get the session along with anything else from the main app connect stack
  console.log(req.body) //access the passed data inside req.body;
  console.log(req.clientID) //access the socket clients ID
  
  //You can access the clients socket
  req.io.emit('success', {
    message: 'foo'
  });
});

```

For the browser

```
var socket = io.connect('http://www.example.com');

socket.on('ionize:connect', function () { //ionize has it's own connect event, which may be fired after the Socket.io one
	socket.emit('myRoute', {
		data: 'This is some data'
	});
});
```

#### Settings

```
limit:        0,  		       //You can limit the number of connections
cookieCheck: true,		       //make sure the cookie is present (set to false if you are using as an API)
cookieKey:   'express.sid',           //The key of the Express cookie, only need to change if you are using a custom key
useRedis: 				//Use Redis to store clients, necessary when spanning multiple processes
redisHost:   '',                      //The host of the Redis store
redisPort:   '',                      //The port of the Redis store
redisPass:   '',                      //The password for the Redis store if you have one set
authorize:    function (handshake) {   //Function called when negotiating the socket handshake, return a boolean
  return true;
},
authenticate: function (socket, req) { //Function called when a socket connects, returns a boolean value
  return true;
},
generate:     function (socket, req) { //Function called to generate an ID, has access to the session, the session ID, the socket ID, and anything within the main Express middleware stack
  return socket.id;
},
connect:      function (socket, req) { }, //Function called when a socket successfully connects
disconnect:   function (req, message) { },  //Function called when a socket is disconnected
```

###Socket.io Configuration

By default Socket.io is not configured, you can choose to configure Socket.io by using
```
ionize.configSocketIo(opts);
```
Run this only after you have called "listen" on the server.

You can pass any of the options from the official Socket.io configuration settings.
```
useRedis: true, 		//Configures Socket.io to use Redis as it's store (needed for spanning multiple processes)
set: {
	key: value,
	key: value		//Used to pass settings to io.set(key, value);
},
enable: [ value, value ]	//Used to enable settings with io.enable(value);
```

Alternatively you can retrieve the Socket.io instance and do your own custom configuration using
```
var io = ionize.getSocketIoInstance();

io.configure(function () {
	io.set(...);
});
```

###Example/Tests

You can run the example located in the **test** folder to get an idea of what is needed for a base setup, as well as defining routes and handling incoming and outgoing messages.
