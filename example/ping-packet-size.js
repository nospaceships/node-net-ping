
var ping = require ("../");

if (process.argv.length < 3) {
	console.log ("usage: node ping <target> [<target> ...]");
	process.exit (-1);
}

var targets = [];

for (var i = 2; i < process.argv.length; i++)
	targets.push (process.argv[i]);

var options = {
	packetSize: 4,
	retries: 1,
	timeout: 2000
};

var session = ping.createSession (options);

session.on ("error", function (error) {
	console.trace (error.toString ());
});

for (var i = 0; i < targets.length; i++) {
	session.pingHost (targets[i], function (error, target) {
		if (error)
			if (error instanceof ping.RequestTimedOutError)
				console.log (target + ": Not alive");
			else
				console.log (target + ": " + error.toString ());
		else
			console.log (target + ": Alive");
	});
}
