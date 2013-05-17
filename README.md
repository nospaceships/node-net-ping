
# net-ping - [homepage][homepage]

This module implements ICMP Echo (ping) support for [Node.js][nodejs].

This module is installed using [node package manager (npm)][npm]:

    npm install net-ping

It is loaded using the `require()` function:

    var ping = require ("net-ping");

A ping session can then be created to ping many hosts:

    var session = ping.createSession ();

    session.pingHost (target, function (error, target) {
        if (error)
            console.log (target + ": " + error.toString ());
        else
            console.log (target + ": Alive");
    });

[homepage]: http://re-tool.org "Homepage"
[nodejs]: http://nodejs.org "Node.js"
[npm]: https://npmjs.org/ "npm"

# Network Protocol Support

This module supports IPv4 using the ICMP, and IPv6 using the ICMPv6.

# Error Handling

Each request exposed by this module (currently only `pingHost()`) requires a
mandatory callback function.  The callback function is executed once the
request has completed.

A request can complete in a number of ways, for example the request timed out,
a response was received from a host other than the targeted host (i.e. a
gateway) or an error occurred when sending the request.

All errors excluding a timed out error are passed to the callback function as
an instance of the `Error` object.  For timed out errors the error passed to
the callback function will be an instance of the `ping.RequestTimedOutError`
object, with the exposed `message` attribute set to `Request timed out`.

This makes it easy to determine if a host responded or whether an error
occurred:

    session.pingHost ("1.2.3.4", function (error, target) {
        if (error)
            if (error instanceof ping.RequestTimedOutError)
                console.log (target + ": Not alive");
            else
                console.log (target + ": " + error.toString ());
        else
            console.log (target + ": Alive");
    });

If a host other than the target reports an error its address will be included
in the error, i.e.:

    $ sudo node example/ping-ttl.js 1 192.168.2.10 192.168.2.20 192.168.2.30
    192.168.2.10: Alive
    192.168.2.20: Error: Time exceeded (source=192.168.1.1)
    192.168.2.30: Not alive

The `Session` class will emit an `error` event for any other error not
directly associated with a request.

# Packet Size

By default ICMP echo request packets sent by this module are 16 bytes in size.
Some implementations cannot cope with such small ICMP echo requests.  For
example, some implementations will return an ICMP echo reply, but will include
an incorrect ICMP checksum.

This module exposes a `packetSize` option to the `createSession()` method which
specifies how big ICMP echo request packets should be:

    var session = ping.createSession ({packetSize: 64});

# Constants

The following sections describe constants exported and used by this module.

## ping.NetworkProtocol

This object contains constants which can be used for the `networkProtocol`
option to the `createSession()` function exposed by this module.  This option
specifies the IP protocol version to use when creating the raw socket.

The following constants are defined in this object:

 * `IPv4` - IPv4 protocol
 * `IPv6` - IPv6 protocol

# Using This Module

The `Session` class is used to issue ping requests to many hosts.  This module
exports the `createSession()` function which is used to create instances of
the `Session` class.

## ping.createSession ([options])

The `createSession()` function instantiates and returns an instance of the
`Session` class:

    // Default options
    var options = {
        networkProtocol: ping.NetworkProtocol.IPv4,
        packetSize: 16,
        retries: 1,
        sessionId: process.pid,
        timeout: 2000
    };
    
    var session = ping.createSession (options);

The optional `options` parameter is an object, and can contain the following
items:

 * `networkProtocol` - Either the constant `ping.NetworkProtocol.IPv4` or the
   constant `ping.NetworkProtocol.IPv6`, defaults to the constant
   `ping.NetworkProtocol.IPv4`
 * `packetSize` - How many bytes each ICMP echo request packet should be,
   defaults to `16`, if the value specified is less that `12` then the value
   `12` will be used (8 bytes are required for the ICMP packet itself, then 4
   bytes are required to encode a unique session ID in the request and response
   packets)
 * `retries` - Number of times to re-send a ping requests, defaults to `1`
 * `sessionId` - A unique ID used to identify request and response packets sent
   by this instance of the `Session` class, valid numbers of in the range of
   `1` to `65535`, defaults to the value of `process.pid % 65535`
 * `timeout` - Number of milliseconds to wait for a response before re-trying
   or failing, defaults to `2000`

After creating the ping `Session` object an underlying raw socket will be
created.  If the underlying raw socket cannot be opened an exception with be
thrown.  The error will be an instance of the `Error` class.

Seperate instances of the `Session` class must be created for IPv4 and IPv6.

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

The calback function for each outstanding ping requests will be called.  The
error parameter will be an instance of the `Error` class, and the `message`
attribute set to `Socket forcibly closed`.

The sessoin can be re-used simply by submitting more ping requests, a new raw
socket will be created to serve the new ping requests.  This is a way in which
to clear outstanding requests.

The following example submits a ping request and prints the target which
successfully responded first, and then closes the session which will clear the
other outstanding ping requests.

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

The `pingHost()` method sends a ping request to a remote host.

The `target` parameter is the dotted quad formatted IP address of the target
host for IPv4 sessions, or the compressed formatted IP address of the target
host for IPv6 sessions.

The `callback` function is called once the ping requests is complete.  The
following arguments will be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `target` - The target parameter as specified in the request, note that
   if a gateway responds on behalf of the target host this parameter will
   still be the target host and NOT the responding gateway

The following example sends a ping request to a remote host:

	session.pingHost ("fe80::a00:27ff:fe2a:3427", function (error, target) {
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

## Version 1.0.1 - 04/02/2013

 * Minor corrections to the README.md
 * Add note to README.md about error handling
 * Timed out errors are now instances of the `ping.RequestTimedOutError`
   object

## Version 1.0.2 - 11/02/2013

 * The RequestTimedOutError class is not being exported

## Version 1.1.0 - 13/02/2013

 * Support IPv6

## Version 1.1.1 - 15/02/2013

 * The `ping.Session.close()` method was not undefining the sessions raw
   socket after closing
 * Return self from the `pingHost()` method to chain method calls 

## Version 1.1.2 - 04/03/2013

 * Use the `raw.Socket.pauseRecv()` and `raw.Socket.resumeRecv()` methods
   instead of closing a socket when there are no more outstanding requests

## Version 1.1.3 - 07/03/2013

 * Sessions were limited to sending 65535 ping requests

## Version 1.1.4 - 09/04/2013

 * Add the `packetSize` option to the `createSession()` method to specify how
   many bytes each ICMP echo request packet should be

## Version 1.1.5 - ?

 * Incorrectly parsing ICMP error responses resulting in responses matching
   the wrong request
 * Use a unique session ID per instance of the `Session` class to identify
   requests and responses sent by a session
 * Added the (internal) `_debugRequest()` and `_debugResponse()` methods, and
   the `_debug` option to the `createSession()` method
 * Added example programs `ping-ttl.js` and `ping6-ttl.js`
 * Use MIT license instead of GPL

# Roadmap

In no particular order:

 * Implement traceRoute()

Suggestions and requirements should be sent to <stephen.vickers.sv@gmail.com>.

# License

Copyright (c) 2013 Stephen Vickers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

# Author

Stephen Vickers <stephen.vickers.sv@gmail.com>
