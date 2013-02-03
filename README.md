
# raw-socket - [homepage][homepage]

This module implements ICMP Echo (ping) support for [Node.js][nodejs].

This module is installed using [node package manager (npm)][npm]:

    npm install net-ping

It is loaded using the `require()` function:

    var raw = require ("net-ping");

A ping session can then be created to ping many hosts:

    var session = ping.createSession ();

    for (var i = 0; i < targets.length; i++) {
        session.pingHost (targets[i], function (error, target) {
            if (error)
                console.log (target + ": " + error.toString ());
            else
                console.log (target + ": Alive");
        });
    }

[homepage]: http://re-tool.org "Homepage"
[nodejs]: http://nodejs.org "Node.js"
[npm]: https://npmjs.org/ "npm"

# Using This Module

The `Session` class is used to issue ping requests to many hosts.  This module
exports the `createSession()` function which is used to create instances of
the `Session` class.

## ping.createSession ([options])

The `createSession()` function instantiates and returns an instance of the
`Session` class:

    // Default options
    var options = {
        retries: 1,
        timeout: 2000
    };
    
    var session = ping.createSession (options);

The optional `options` parameter is an object, and can contain the following
items:

 * `retries` - Number of times to re-send a request, defaults to `1`
 * `timeout` - Number of milliseconds to wait for a response before re-trying
   or failing, defaults to `2000`

After creating the ping `Session` object an underlying raw socket will be
created.  If the underlying raw socket cannot be opened an exception with be
thrown.  The error will be an instance of the `Error` class.

## session.on ("close", callback)

The `close` event is emitted by the session when the underlying raw socket
is closed.

No arguments are passed to the callback.

The following example prints a message to the console when the underlying raw
socket is closed:

    session.on ("close", function () {
        console.log ("socket closed");
    });

## session.on ("error", callback)

The `error` event is emitted by the session when the underlying raw socket
emits an error.

The following arguments will be passed to the `callback` function:

 * `error` - An instance of the `Error` class, the exposed `message` attribute
   will contain a detailed error message.

The following example prints a message to the console when an error occurs
with the underlying raw socket, the session is then closed:

    session.on ("error", function (error) {
        console.log (error.toString ());
        session.close ();
    });

## session.close ()

The `close()` method closes the underlying raw socket, and cancels all
outstanding requsts.

The calback function for each outstanding request will be called.  The error
parameter will be an instance of the `Error` class, and the `message`
attribute set to `Socket forcibly closed`.

The sessoin can be re-used simply by submitting more ping requests, a new raw
socket will be created to serve the new requests.  This is a way in which to
clear outstanding requests.

The following example submits a ping request and prints the target which
successfully responded first, and then closes the session which will clear the
other outstanding requests.

    var targets = ["1.1.1.1", "2.2.2.2", "3.3.3.3"];
    
    for (var i = 0; i < targets.length; i++) {
        session.pingHost (targets[i], function (error, target) {
            if (! error) {
                console.log (target);
                session.close (); 
            }
        });
    }

## session.pingHost (target, callback)

The `pingHost()` method sends an ICMP echo request to a remote host.

The `target` parameter is the dotted quad formatted IP address of the target
host.

The `callback` function is called once the request is complete.  The following
arguments will be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `target` - Dotted quad formatted IP address of the target host, note that
   if a gateway responds on behalf of the target host this parameter will
   still be the IP address of the target host and NOT the responding gateways

The following example sends a ping request to a remote host:

	session.pingHost ("192.168.1.254", function (error, target) {
		if (error)
			console.log (target + ": " + error.toString ());
		else
			console.log (target + ": Alive");
	});

# Example Programs

Example programs are included under the modules `example` directory.

# Bugs & Known Issues

None, yet!

Bug reports should be sent to <stephen.vickers.sv@gmail.com>.

# Changes

## Version 1.0.0 - 03/02/2013

 * Initial release

# Roadmap

In no particular order:

 * Helper methods such as `pingSubnet()`, `pingBlock()` and `pingRange()`
 * Support IPv6

Suggestions and requirements should be sent to <stephen.vickers.sv@gmail.com>.

# License

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
details.

You should have received a copy of the GNU General Public License along with
this program.  If not, see
[http://www.gnu.org/licenses](http://www.gnu.org/licenses).

# Author

Stephen Vickers <stephen.vickers.sv@gmail.com>
