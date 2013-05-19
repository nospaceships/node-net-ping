
var ping = require ("../");

if (process.argv.length < 3) {
	console.log ("usage: node ping-response-time <target> [<target> ...]");
	process.exit (-1);
}

var targets = [];

for (var i = 2; i < process.argv.length; i++)
	targets.push (process.argv[i]);

var options = {
	retries: 3,
	timeout: 2000
};

var session = ping.createSession (options);

session.on ("error", function (error) {
	console.trace (error.toString ());
});

for (var i = 0; i < targets.length; i++) {
	session.pingHost (targets[i], function (error, target, sent, rcvd) {
		var ms = rcvd - sent;
		if (error)
			if (error instanceof ping.RequestTimedOutError)
				console.log (target + ": Not alive (ms=" + ms + ")");
			else
				console.log (target + ": " + error.toString () + " (ms="
						+ ms + ")");
		else
			console.log (target + ": Alive alive (ms=" + ms + ")");
	});
}
