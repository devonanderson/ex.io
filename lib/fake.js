var through = require('through');

exports.response = function () {
    
    var self = through(); //new http.ServerResponse(req);
    
    self.shouldKeepAlive = false;
    self.statusCode = self.code = 200;
    self._headers = {};
    
    self.writeHead = function(code, reason, headers) {
        
        if (!headers) { 
            headers = reason;
            reason  = '';
        }
        
        self.code = code;

        for (var key in headers) {
            self._headers[key] = headers[key];
        }
        
        self.reason = reason;
    }
    
    self.setHeader = function(key, val) {
        self._headers[key] = val;
    }
    
    self.body = [];
    
    self.on('data', function resReadable(d) {
        if(d) {
            self.body.push(d.toString());
        }
    });


    return self;
}

exports.request = function () {
    
    var self = through();
    
    self.httpVersion = '1.1';
    self.url = '';
    self.originalUrl = '';
    self.query = '';
    self.method = 'GET';
    self.headers = {};
    self.session = {};
    self.socket = {};
    
    self.header = function(h) {
        return self.headers[h.toLowerCase()];
    }

    self.setHeader = function(key, val) {
        self.headers[key.toLowerCase()] = val;
    }
    
    self.pipesCount = 0;
    self._readableState = {
        flowing:true
    }
    
    var oldpipe = self.pipe;
    
    self.pipe = function() {
        "use strict";
        self.pipesCount++;
        oldpipe.apply(this, arguments);
    }

    return self;
}