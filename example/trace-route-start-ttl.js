
var ping = require ("../");

if (process.argv.length < 4) {
	console.log ("usage: node trace-route <start-ttl> <ttl> <target> [<target> ...]");
	process.exit (-1);
}

var startTtl = parseInt (process.argv[2]);
var ttl = parseInt (process.argv[3]);
var targets = [];

for (var i = 4; i < process.argv.length; i++)
	targets.push (process.argv[i]);

var options = {
	retries: 1,
	timeout: 2000
};

var session = ping.createSession (options);

session.on ("error", function (error) {
	console.trace (error.toString ());
});

function doneCb (error, target) {
	if (error)
		console.log (target + ": " + error.toString ());
	else
		console.log (target + ": Done");
}

function feedCb (error, target, ttl, sent, rcvd) {
	var ms = rcvd - sent;
	if (error) {
		if (error instanceof ping.TimeExceededError) {
			console.log (target + ": " + error.source + " (ttl=" + ttl
					+ " ms=" + ms +")");
		} else {
			console.log (target + ": " + error.toString () + " (ttl=" + ttl
					+ " ms=" + ms +")");
		}
	} else {
		console.log (target + ": " + target + " (ttl=" + ttl + " ms="
				+ ms +")");
	}
}

for (var i = 0; i < targets.length; i++) {
	var traceOptions = {
		ttl: ttl,
		startTtl: startTtl
	};
	session.traceRoute (targets[i], traceOptions, feedCb, doneCb);
}
