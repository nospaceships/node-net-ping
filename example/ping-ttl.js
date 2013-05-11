
var ping = require ("../");
var raw = require ("raw-socket");

if (process.argv.length < 4) {
	console.log ("usage: node ping-ttl <ttl> <target> [<target> ...]");
	process.exit (-1);
}

var ttl = parseInt (process.argv[2]);
var targets = [];

for (var i = 3; i < process.argv.length; i++)
	targets.push (process.argv[i]);

var options = {
	packetSize: 4,
	retries: 1,
	timeout: 2000
};

var session = ping.createSession (options);

session.getSocket ().setOption (raw.SocketLevel.IPPROTO_IP,
		raw.SocketOption.IP_TTL, ttl);

session.on ("error", function (error) {
	console.trace (error.toString ());
});

for (var i = 0; i < targets.length; i++) {
	session.pingHost (targets[i], function (error, target, source) {
		console.log (i);
		if (error)
			if (error instanceof ping.RequestTimedOutError)
				console.log (target + ": Not alive");
			else
				if (target != source)
					console.log (target + ": " + error.toString () + " (source=" + source + ")");
				else
					console.log (target + ": " + error.toString ());
		else
			console.log (target + ": Alive");
	});
}
