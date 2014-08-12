
var ping = require ("../");

if (process.argv.length < 4) {
	console.log ("usage: node ping-retries-0 <target> <timeout>");
	process.exit (-1);
}

var target = process.argv[2];

var options = {
	retries: 0,
	timeout: parseInt(process.argv[3])
};

var session = ping.createSession (options);

session.on ("error", function (error) {
	console.trace (error.toString ());
});

session.pingHost (target, function (error, target) {
	if (error)
		if (error instanceof ping.RequestTimedOutError)
			console.log (target + ": Not alive");
		else
			console.log (target + ": " + error.toString ());
	else
		console.log (target + ": Alive");
});
