
var events = require ("events");
var net = require ("net");
var raw = require ("raw-socket");
var util = require ("util");

function _expandConstantObject (object) {
	var keys = [];
	for (var key in object)
		keys.push (key);
	for (var i = 0; i < keys.length; i++)
		object[object[keys[i]]] = parseInt (keys[i]);
}

var NetworkProtocol = {
	1: "IPv4",
	2: "IPv6"
};

_expandConstantObject (NetworkProtocol);

function DestinationUnreachableError (source) {
	this.name = "DestinationUnreachableError";
	this.message = "Destination unreachable (source=" + source + ")";
	this.source = source;
}
util.inherits (DestinationUnreachableError, Error);

function PacketTooBigError (source) {
	this.name = "PacketTooBigError";
	this.message = "Packet too big (source=" + source + ")";
	this.source = source;
}
util.inherits (PacketTooBigError, Error);

function ParameterProblemError (source) {
	this.name = "ParameterProblemError";
	this.message = "Parameter problem (source=" + source + ")";
	this.source = source;
}
util.inherits (ParameterProblemError, Error);

function RedirectReceivedError (source) {
	this.name = "RedirectReceivedError";
	this.message = "Redirect received (source=" + source + ")";
	this.source = source;
}
util.inherits (RedirectReceivedError, Error);

function RequestTimedOutError () {
	this.name = "RequestTimedOutError";
	this.message = "Request timed out";
}
util.inherits (RequestTimedOutError, Error);

function SourceQuenchError (source) {
	this.name = "SourceQuenchError";
	this.message = "Source quench (source=" + source + ")";
	this.source = source;
}
util.inherits (SourceQuenchError, Error);

function TimeExceededError (source) {
	this.name = "TimeExceededError";
	this.message = "Time exceeded (source=" + source + ")";
	this.source = source;
}
util.inherits (TimeExceededError, Error);

function Session (options) {
	this.retries = (options && options.retries != undefined) ? options.retries : 1;
	this.timeout = (options && options.timeout) ? options.timeout : 2000;

	this.packetSize = (options && options.packetSize) ? options.packetSize : 16;

	if (this.packetSize < 12)
		this.packetSize = 12;

	this.addressFamily = (options && options.networkProtocol
				&& options.networkProtocol == NetworkProtocol.IPv6)
			? raw.AddressFamily.IPv6
			: raw.AddressFamily.IPv4;

	this._debug = (options && options._debug) ? true : false;
	
	this.defaultTTL = (options && options.ttl) ? options.ttl : 128;
	
	this.sessionId = (options && options.sessionId)
			? options.sessionId
			: process.pid;
	
	this.sessionId = this.sessionId % 65535;
	
	this.nextId = 1;

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

Session.prototype._debugRequest = function (target, req) {
	console.log ("request: addressFamily=" + this.addressFamily + " target="
			+ req.target + " id=" + req.id + " buffer="
			+ req.buffer.toString ("hex"));
}

Session.prototype._debugResponse = function (source, buffer) {
	console.log ("response: addressFamily=" + this.addressFamily + " source="
			+ source + " buffer=" + buffer.toString ("hex"));
}

Session.prototype.flush = function (error) {
	for (id in this.reqs) {
		var req = this.reqRemove (id);
		var sent = req.sent ? req.sent : new Date ();
		req.callback (error, req.target, sent, new Date ());
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

	this.socket = raw.createSocket (options);
	this.socket.on ("error", this.onSocketError.bind (me));
	this.socket.on ("close", this.onSocketClose.bind (me));
	this.socket.on ("message", this.onSocketMessage.bind (me));
	
	this.ttl = null;
	this.setTTL (this.defaultTTL);
	
	return this.socket;
};

Session.prototype.fromBuffer = function (buffer) {
	var offset, type, code;

	if (this.addressFamily == raw.AddressFamily.IPv6) {
		// IPv6 raw sockets don't pass the IPv6 header back to us
		offset = 0;

		if (buffer.length - offset < 8)
			return;
		
		// We don't believe any IPv6 options will be passed back to us so we
		// don't attempt to pass them here.

		type = buffer.readUInt8 (offset);
		code = buffer.readUInt8 (offset + 1);
	} else {
		// Need at least 20 bytes for an IP header, and it should be IPv4
		if (buffer.length < 20 || (buffer[0] & 0xf0) != 0x40)
			return;

		// The length of the IPv4 header is in mulitples of double words
		var ip_length = (buffer[0] & 0x0f) * 4;

		// ICMP header is 8 bytes, we don't care about the data for now
		if (buffer.length - ip_length < 8)
			return;

		var ip_icmp_offset = ip_length;

		// ICMP message too short
		if (buffer.length - ip_icmp_offset < 8)
			return;

		type = buffer.readUInt8 (ip_icmp_offset);
		code = buffer.readUInt8 (ip_icmp_offset + 1);

		// For error type responses the sequence and identifier cannot be
		// extracted in the same way as echo responses, the data part contains
		// the IP header from our request, followed with at least 8 bytes from
		// the echo request that generated the error, so we first go to the IP
		// header, then skip that to get to the ICMP packet which contains the
		// sequence and identifier.
		if (type == 3 || type == 4 || type == 5 || type == 11) {
			var ip_icmp_ip_offset = ip_icmp_offset + 8;

			// Need at least 20 bytes for an IP header, and it should be IPv4
			if (buffer.length - ip_icmp_ip_offset  < 20
					|| (buffer[ip_icmp_ip_offset] & 0xf0) != 0x40)
				return;

			// The length of the IPv4 header is in mulitples of double words
			var ip_icmp_ip_length = (buffer[ip_icmp_ip_offset] & 0x0f) * 4;

			// ICMP message too short
			if (buffer.length - ip_icmp_ip_offset - ip_icmp_ip_length < 8)
				return;

			offset = ip_icmp_ip_offset + ip_icmp_ip_length;
		} else {
			offset = ip_icmp_offset
		}
	}

	// Response is not for a request we generated
	if (buffer.readUInt16BE (offset + 4) != this.sessionId)
		return;

	buffer[offset + 4] = 0;
	
	var id = buffer.readUInt16BE (offset + 6);
	var req = this.reqs[id];

	if (req) {
		req.type = type;
		req.code = code;
		return req;
	} else {
		return null;
	}
};

Session.prototype.onBeforeSocketSend = function (req) {
	this.setTTL (req.ttl ? req.ttl : this.defaultTTL);
}

Session.prototype.onSocketClose = function () {
	this.emit ("close");
	this.flush (new Error ("Socket closed"));
};

Session.prototype.onSocketError = function (error) {
	this.emit ("error", error);
};

Session.prototype.onSocketMessage = function (buffer, source) {
	if (this._debug)
		this._debugResponse (source, buffer);

	var req = this.fromBuffer (buffer);
	if (req) {
		/**
		 ** If we ping'd ourself (i.e. 127.0.0.1 or ::1) then it is likely we
		 ** will receive the echo request in addition to any corresponding echo
		 ** responses.  We discard the request packets here so that we don't
		 ** delete the request from the from the request queue since we haven't
		 ** actually received a response yet.
		 **/
		if (this.addressFamily == raw.AddressFamily.IPv6) {
			if (req.type == 128)
				return;
		} else {
			if (req.type == 8)
				return;
		}
		
		this.reqRemove (req.id);
		
		if (this.addressFamily == raw.AddressFamily.IPv6) {
			if (req.type == 1) {
				req.callback (new DestinationUnreachableError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 2) {
				req.callback (new PacketTooBigError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 3) {
				req.callback (new TimeExceededError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 4) {
				req.callback (new ParameterProblemError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 129) {
				req.callback (null, req.target,
						req.sent, new Date ());
			} else {
				req.callback (new Error ("Unknown response type '" + req.type
						+ "' (source=" + source + ")"), req.target,
						req.sent, new Date ());
			}
		} else {
			if (req.type == 0) {
				req.callback (null, req.target,
						req.sent, new Date ());
			} else if (req.type == 3) {
				req.callback (new DestinationUnreachableError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 4) {
				req.callback (new SourceQuenchError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 5) {
				req.callback (new RedirectReceivedError (source), req.target,
						req.sent, new Date ());
			} else if (req.type == 11) {
				req.callback (new TimeExceededError (source), req.target,
						req.sent, new Date ());
			} else {
				req.callback (new Error ("Unknown response type '" + req.type
						+ "' (source=" + source + ")"), req.target,
						req.sent, new Date ());
			}
		}
	}
};

Session.prototype.onSocketSend = function (req, error, bytes) {
	if (! req.sent)
		req.sent = new Date ();
	if (error) {
		this.reqRemove (req.id);
		req.callback (error, req.target, req.sent, req.sent);
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
		this.reqRemove (req.id);
		req.callback (new RequestTimedOutError ("Request timed out"),
				req.target, req.sent, new Date ());
	}
};

// Keep searching for an ID which is not in use
Session.prototype._generateId = function () {
	var startId = this.nextId++;
	while (1) {
		if (this.nextId > 65535)
			this.nextId = 1;
		if (this.reqs[this.nextId]) {
			this.nextId++;
		} else {
			return this.nextId;
		}
		// No free request IDs
		if (this.nextId == startId)
			return;
	}
}

Session.prototype.pingHost = function (target, callback) {
	var id = this._generateId ();
	if (! id) {
		callback (new Error ("Too many requests outstanding"), target);
		return this;
	}

	var req = {
		id: id,
		retries: this.retries,
		timeout: this.timeout,
		callback: callback,
		target: target
	};

	this.reqQueue (req);

	return this;
};

Session.prototype.reqQueue = function (req) {
	req.buffer = this.toBuffer (req);

	if (this._debug)
		this._debugRequest (req.target, req);

	this.reqs[req.id] = req;
	this.reqsPending++;
	this.send (req);
	
	return this;
}

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
			this.onBeforeSocketSend.bind (me, req),
			this.onSocketSend.bind (me, req));
};

Session.prototype.setTTL = function (ttl) {
	if (this.ttl && this.ttl == ttl)
		return;

	var level = this.addressFamily == raw.AddressFamily.IPv6
			? raw.SocketLevel.IPPROTO_IPV6
			: raw.SocketLevel.IPPROTO_IP;
	this.getSocket ().setOption (level, raw.SocketOption.IP_TTL, ttl);
	this.ttl = ttl;
}

Session.prototype.toBuffer = function (req) {
	var buffer = new Buffer (this.packetSize);

	// Since our buffer represents real memory we should initialise it to
	// prevent its previous contents from leaking to the network.
	for (var i = 8; i < this.packetSize; i++)
		buffer[i] = 0;

	var type = this.addressFamily == raw.AddressFamily.IPv6 ? 128 : 8;

	buffer.writeUInt8 (type, 0);
	buffer.writeUInt8 (0, 1);
	buffer.writeUInt16BE (0, 2);
	buffer.writeUInt16BE (this.sessionId, 4);
	buffer.writeUInt16BE (req.id, 6);

	raw.writeChecksum (buffer, 2, raw.createChecksum (buffer));

	return buffer;
};

Session.prototype.traceRouteCallback = function (trace, req, error, target,
		sent, rcvd) {
	if (trace.feedCallback (error, target, req.ttl, sent, rcvd)) {
		trace.doneCallback (new Error ("Trace forcibly stopped"), target);
		return;
	}

	if (error) {
		if (req.ttl >= trace.ttl) {
			trace.doneCallback (error, target);
			return;
		}
		
		if ((error instanceof RequestTimedOutError) && ++trace.timeouts >= trace.maxHopTimeouts) {
			trace.doneCallback (new Error ("Too many timeouts"), target);
			return;
		}

		var id = this._generateId ();
		if (! id) {
			trace.doneCallback (new Error ("Too many requests outstanding"),
					target);
			return;
		}

		req.ttl++;
		req.id = id;
		var me = this;
		req.retries = this.retries;
		req.sent = null;
		this.reqQueue (req);
	} else {
		trace.doneCallback (null, target);
	}
}

Session.prototype.traceRoute = function (target, ttlOrOptions, feedCallback,
		doneCallback) {
	// signature was (target, feedCallback, doneCallback)
	if (! doneCallback) {
		doneCallback = feedCallback;
		feedCallback = ttlOrOptions;
		ttlOrOptions = {ttl: this.ttl};
	}

	var maxHopTimeouts = 3;
	var startTtl = 1;
	var ttl = this.ttl;

	if (typeof ttlOrOptions == "object") {
		if (ttlOrOptions.ttl)
			ttl = ttlOrOptions.ttl;
		if (ttlOrOptions.maxHopTimeouts)
			maxHopTimeouts = ttlOrOptions.maxHopTimeouts;
		if (ttlOrOptions.startTtl)
			startTtl = ttlOrOptions.startTtl;
	} else {
		ttl = ttlOrOptions;
	}

	var id = this._generateId ();
	if (! id) {
		var sent = new Date ();
		doneCallback (new Error ("Too many requests outstanding"), target,
				sent, sent);
		return this;
	}

	var trace = {
		feedCallback: feedCallback,
		doneCallback: doneCallback,
		ttl: ttl,
		maxHopTimeouts: maxHopTimeouts,
		timeouts: 0
	};
	
	var me = this;

	var req = {
		id: id,
		retries: this.retries,
		timeout: this.timeout,
		ttl: startTtl,
		target: target
	};
	req.callback = me.traceRouteCallback.bind (me, trace, req);
	
	this.reqQueue (req);

	return this;
};

exports.createSession = function (options) {
	return new Session (options || {});
};

exports.NetworkProtocol = NetworkProtocol;

exports.Session = Session;

exports.DestinationUnreachableError = DestinationUnreachableError;
exports.PacketTooBigError = PacketTooBigError;
exports.ParameterProblemError = ParameterProblemError;
exports.RedirectReceivedError = RedirectReceivedError;
exports.RequestTimedOutError = RequestTimedOutError;
exports.SourceQuenchError = SourceQuenchError;
exports.TimeExceededError = TimeExceededError;
