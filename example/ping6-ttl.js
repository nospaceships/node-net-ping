
var ping = require ("../");
var raw = require ("raw-socket");

if (process.argv.length < 4) {
	console.log ("usage: node ping6-ttl <ttl> <target> [<target> ...]");
	process.exit (-1);
}

var ttl = parseInt (process.argv[2]);
var targets = [];

for (var i = 3; i < process.argv.length; i++)
	targets.push (process.argv[i]);

var options = {
	networkProtocol: ping.NetworkProtocol.IPv6,
	packetSize: 4,
	retries: 1,
	ttl: ttl,
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
