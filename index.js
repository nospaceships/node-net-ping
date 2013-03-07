
var events = require ("events");
var net = require ("net");
var raw = require ("raw-socket");
var util = require ("util");

function _expandConstantObject (object) {
	var keys = [];
	for (key in object)
		keys.push (key);
	for (var i = 0; i < keys.length; i++)
		object[object[keys[i]]] = parseInt (keys[i]);
}

var NetworkProtocol = {
	1: "IPv4",
	2: "IPv6"
};

_expandConstantObject (NetworkProtocol);

function RequestTimedOutError (message) {
	this.name = "RequestTimedOutError";
	this.message = message;
}
util.inherits (RequestTimedOutError, Error);

function Session (options) {
	this.retries = (options && options.retries) ? options.retries : 1;
	this.timeout = (options && options.timeout) ? options.timeout : 2000;
	
	this.addressFamily = (options && options.networkProtocol
				&& options.networkProtocol == NetworkProtocol.IPv6)
			? raw.AddressFamily.IPv6
			: raw.AddressFamily.IPv4;
	
	this.socket = null;
	
	this.reqs = {};
	this.reqsPending = 0;
	
	this.getSocket ();
};

util.inherits (Session, events.EventEmitter);

Session.prototype.close = function () {
	if (this.socket)
		this.socket.close ();
	this.flush (new Error ("Socket forcibly closed"));
	delete this.socket;
	return this;
};

Session.prototype.flush = function (error) {
	for (id in this.reqs) {
		var req = this.reqRemove (id);
		req.callback (error, req.target, false);
	}
};

Session.prototype.getSocket = function () {
	if (this.socket)
		return this.socket;

	var protocol = this.addressFamily == raw.AddressFamily.IPv6
			? raw.Protocol.ICMPv6
			: raw.Protocol.ICMP;

	var me = this;
	var options = {
		addressFamily: this.addressFamily,
		protocol: protocol
	};
	
	// For IPv6 the operating system will calculate checksums for us
	if (this.addressFamily != raw.AddressFamily.IPv6) {
		options.generateChecksums = true;
		options.checksumOffset = 2;
	}
	
	this.socket = raw.createSocket (options);
	this.socket.on ("error", this.onSocketError.bind (me));
	this.socket.on ("close", this.onSocketClose.bind (me));
	this.socket.on ("message", this.onSocketMessage.bind (me));
	return this.socket;
};

Session.prototype.fromBuffer = function (buffer) {
	var offset;

	if (this.addressFamily == raw.AddressFamily.IPv6) {
		// IPv6 raw sockets don't pass the IP header back to us
		offset = 0;
	} else {
		// IP header too short
		if (buffer.length < 20)
			return;

		// IPv4
		if ((buffer[0] & 0xf0) != 0x40)
			return;

		var ip_length = (buffer[0] & 0x0f) * 4;

		// ICMP message too short
		if (buffer.length - ip_length < 8)
			return;
		
		offset = ip_length;
	}
	
	if (buffer.length - offset < 16)
		return null;

	var id = buffer.readUInt32BE (offset + 4);	
	var req = this.reqs[id];
	
	if (req) {
		req.type = buffer.readUInt8 (offset);
		req.code = buffer.readUInt8 (offset + 1);

		return req;
	} else {
		return null;
	}
};

Session.prototype.onSocketClose = function () {
	this.emit ("close");
	this.flush (new Error ("Socket closed"));
};

Session.prototype.onSocketError = function (error) {
	this.emit ("error", error);
};

Session.prototype.onSocketMessage = function (buffer, source) {
	var req = this.fromBuffer (buffer);
	if (req) {
		if (this.addressFamily == raw.AddressFamily.IPv6) {
			if (req.type == 1) {
				req.callback (new Error ("Destination unreachable"), req.target);
			} else if (req.type == 2) {
				req.callback (new Error ("Packet too big"), req.target);
			} else if (req.type == 2) {
				req.callback (new Error ("Time exceeded"), req.target);
			} else if (req.type == 3) {
				req.callback (new Error ("Parameter problem"), req.target);
			} else if (req.type == 129) {
				req.callback (null, req.target);
			} else {
				req.callback (new Error ("Unknown response type '" + req.type
						+ "'"), req.target);
			}
		} else {
			if (req.type == 0) {
				req.callback (null, req.target);
			} else if (req.type == 3) {
				req.callback (new Error ("Destination unreachable"), req.target);
			} else if (req.type == 4) {
				req.callback (new Error ("Source quench"), req.target);
			} else if (req.type == 5) {
				req.callback (new Error ("Redirect received"), req.target);
			} else if (req.type == 11) {
				req.callback (new Error ("Time exceeded"), req.target);
			} else {
				req.callback (new Error ("Unknown response type '" + req.type
						+ "'"), req.target);
			}
		}
		this.reqRemove (req.id);
	}
};

Session.prototype.onSocketSend = function (req, error, bytes) {
	if (error) {
		req.callback (error, req.target);
		this.reqRemove (req.id);
	} else {
		var me = this;
		req.timer = setTimeout (this.onTimeout.bind (me, req), req.timeout);
	}
};

Session.prototype.onTimeout = function (req) {
	if (req.retries > 0) {
		req.retries--;
		this.send (req);
	} else {
		req.callback (new RequestTimedOutError ("Request timed out"),
				req.target);
		this.reqRemove (req.id);
	}
};

var nextId = 1;

// This will wrap after 4294967295 pings
function _generateId (req) {	
	if (nextId > 4294967295)
		nextId = 1;
	return nextId++;
}

Session.prototype.pingHost = function (target, callback) {
	var req = {
		id: _generateId (),
		retries: this.retries,
		timeout: this.timeout,
		callback: callback,
		target: target
	};
	
	req.buffer = this.toBuffer (req);
	
	this.reqs[req.id] = req;
	this.reqsPending++;
	this.send (req);
	
	return this;
};

Session.prototype.reqRemove = function (id) {
	var req = this.reqs[id];
	if (req) {
		clearTimeout (req.timer);
		delete req.timer;
		delete this.reqs[req.id];
		this.reqsPending--;
	}
	// If we have no more outstanding requests pause readable events
	if (this.reqsPending <= 0)
		if (! this.getSocket ().recvPaused)
			this.getSocket ().pauseRecv ();
	return req;
};

Session.prototype.send = function (req) {
	var buffer = req.buffer;
	var me = this;
	// Resume readable events if the raw socket is paused
	if (this.getSocket ().recvPaused)
		this.getSocket ().resumeRecv ();
	this.getSocket ().send (buffer, 0, buffer.length, req.target,
			this.onSocketSend.bind (me, req));
};

Session.prototype.toBuffer = function (req) {
	var buffer = new Buffer (16);
	
	var type = this.addressFamily == raw.AddressFamily.IPv6 ? 128 : 8;
	
	buffer.writeUInt8 (type, 0);
	buffer.writeUInt8 (0, 1);
	buffer.writeUInt16BE (0, 2);
	buffer.writeUInt32BE (req.id, 4);
	
	// Checksums are be generated by our raw.Socket instance
	
	return buffer;
};

exports.createSession = function (options) {
	return new Session (options || {});
};

exports.NetworkProtocol = NetworkProtocol;

exports.Session = Session;

exports.RequestTimedOutError = RequestTimedOutError;
