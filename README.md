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
limit:        0,  		       //You can limit the number of concurrent connections
cookie_check: true,		       //make sure the cookie is present (set to false if you are using as an API)
cookie_key:   'express.sid',           //The key of the Express cookie, only need to change if you are using a custom key
production:   false,                   //Production mode uses a Redis store to scale over multiple processes
redis_host:   '',                      //The host of the Redis store (production only)
redis_port:   '',                      //The port of the Redis store (production only)
redis_pass:   '',                      //The password for the Redis store if you have one set (production only)
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
transports:   [   //Which types of transports to use and the order in which they are used (production only)
  'websocket',
  'flashsocket',
  'htmlfile',
  'xhr-polling',
  'jsonp-polling'
]
```

You can run the example located in the test folder to get an idea of what is needed for a base setup, as well as defining routes and handling incoming and outgoing messages.
