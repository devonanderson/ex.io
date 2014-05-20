ionize
=====

Node module that provides full-integration for Socket.io into Express using only exposed Express API methods. Provides Express like routing, pushing socket requests through the Express main middleware stack as well as allowing middleware definitions at the route level. Provides socket client management with the ability to define custom ID's for each socket. Also provides a wrapper around Socket.io's built in Redis store for integration into production environments.

### Getting started:

```
npm install ionize
```

Then in your app.js file

```
var express = require('express')
  , http = require('http')
  , ionize = require('ionize');
  
var app = express();
  
app.set(...);
app.set(...);
app.set(...);
app.set(express.cookieParser('abc123');
app.set(express.session({ secret: 'abc123' }));
app.set(ionize.middleware()); //place ionize middleware wherever you want the request to end and move on to the route
app.set(app.router) //ionize middleware must be placed above the app.router

var server = http.createServer(app).listen(3000);

//minimum needed for ionize to work
ionize = ionize.create(app, {
  secret: 'abc123' 
}).listen(server);

ionize.route('myRoute', middleware, middleware, function (req, res) {
  console.log(req.socketRoute); //you can get the route that the socket is using 
  console.log(req.session); //you get the session along with anything else from the main app connect stack
  console.log(req.body) //access the passed data inside req.body;
  console.log(req.io.ionize.id) //access the sockets clientID, that was created using the generate() function
  
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

### Settings

```
limit:       0,                        //You can limit the number of connections
useCookie:   true,		       //make sure the cookie is present (set to false if you are using as an API)
cookieKey:   'express.sid',            //The key of the Express cookie, only need to change if you are using a custom key
useRedis:    false                     //Use Redis to store clients, necessary when spanning multiple processes
redisHost:   '',                       //The host of the Redis store
redisPort:   '',                       //The port of the Redis store
redisPass:   '',                       //The password for the Redis store if you have one set
authorize:    function (handshake, callback) {   //Function called when negotiating the socket handshake, the callback accepts an error message and a boolean (true to allow, false to deny and return the error message)
  callback(null, true);
},
authenticate: function (socket, req, callback) { //Function called when a socket connects
  callback(null, true)
},
generate:     function (socket, req, callback) { //Function called to generate an ID that will be associated with the socket, pass the desired ID to the callback
  callback(socket.id);
},
connection:   function (req) { },  //Function called when a socket successfully connects, passes the connection request object
disconnect:   function (req) { },  //Function called when a socket is disconnected passes the original connection request object
```

You can dynamically define the available functions and events by using
```
ionize.on(event, function () { }); //events are connect and disconnet
```
```
ionize.set(function, function () { }); //functions are authorize, authenticate and generate
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
redisHost: '',
redisPort: '',
redisPass: '',
set: {
	key: value,
	key: value              //Used to pass settings to io.set(key, value);
},
enable: [ value, value ]        //Used to enable settings with io.enable(value);
```

You can also retrieve the Socket.io instance and do your own custom configuration and event handling
```
var io = ionize.io;

io.configure(function () {
	io.set(...);
});
```

###Methods
```
//retrieves a socket based on its client ID and triggers socket.emit(route, data);
ionize.triggerSocket(route, clientID, data, callback); 

//retrieves a socket and triggers a route defined by ionize.route(...), you can pass a socket instance in place of clientID
ionize.triggerRoute(route, clientID, data, callback);

//retrieves a socket by its client ID
ionize.getClientById(clientID, callback);

//retrieves a socket by its client ID and disconnects it
ionize.disconnectClient(clientID, callback);

//returns all of the sockets (alias for io.sockets.sockets)
ionize.getClients();
```

###Example/Tests

You can run the example located in the **test** folder to get an idea of what is needed for a base setup, as well as defining routes and handling incoming and outgoing messages.
