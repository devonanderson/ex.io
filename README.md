Ionize
======

**UPDATED** - Now supports ```Socket.io 1.x``` and ```Express 4.x``` 

Node module that provides full-integration for Socket.io into Express using only exposed Express API methods. Provides Express like routing, pushing socket requests through the Express main middleware stack as well as allowing middleware definitions at the route level.

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
app.set(cookieParser('abc123');
app.set(session({ secret: 'abc123' }));
app.set(ionize.middleware()); //place ionize middleware wherever you want the request to end and move on to the route

var server = http.createServer(app).listen(3000);

//minimum needed for ionize to work
ionize = ionize.create(app, {
  secret: 'abc123' 
}).listen(server);

ionize.set('myRoute', middleware, middleware, function (req, res) {
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
useCookie: true, //make sure the cookie is present (set to false if you are using as an API)
cookieKey: 'connect.sid', //The key of the Express cookie, only need to change if you are using a custom key
authorize: function (handshake, callback) { //Function called when negotiating the socket handshake, the callback accepts an error message and a boolean (true to allow, false to deny and return the error message)
  callback(null, true);
},
authenticate: function (socket, req, callback) { //Function called when a socket connects
  callback(null, true)
},
connection: function (req) { }, //Function called when a socket successfully connects, is passed the connection request object
```

You can dynamically define the configuration functions and events by using
```
ionize.on(event, function () { }); //events are "connect"
```
```
ionize.configure(function, function () { }); //functions are "authorize", "authenticate"
```

###Socket.io Configuration

You can retrieve the Socket.io instance from ionize and do your own custom configuration and event handling
```
var io = ionize.io;

io.use(function () { });
```

###Triggering
```
//triggers a route defined by ionize.set(...)
ionize.triggerRoute(route, socket, data, callback);
```

###Example/Tests

You can run the example located in the **test** folder to get an idea of what is needed for a base setup, as well as defining routes and handling incoming and outgoing messages.
