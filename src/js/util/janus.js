/*
 The MIT License (MIT)

 Copyright (c) 2016 Meetecho

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the "Software"),
 to deal in the Software without restriction, including without limitation
 the rights to use, copy, modify, merge, publish, distribute, sublicense,
 and/or sell copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included
 in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
 */

import adapter from "./adapter.js";

// List of sessions
Janus.sessions = {};

var SDPUtils = {};

// Splits SDP into lines, dealing with both CRLF and LF.
SDPUtils.splitLines = function(blob) {
    return blob.trim().split('\n').map(function(line) {
        return line.trim();
    });
};

// Splits SDP into sessionpart and mediasections. Ensures CRLF.
SDPUtils.splitSections = function(blob) {
    var parts = blob.split('\r\nm=');
    return parts.map(function(part, index) {
        return (index > 0 ? 'm=' + part : part).trim() + '\r\n';
    });
};

// Returns lines that start with a certain prefix.
SDPUtils.matchPrefix = function(blob, prefix) {
    return SDPUtils.splitLines(blob).filter(function(line) {
        return line.indexOf(prefix) === 0;
    });
};

// Parses an ICE candidate line. Sample input:
// candidate:702786350 2 udp 41819902 8.8.8.8 60769 typ relay raddr 8.8.8.8 rport 55996"
SDPUtils.parseCandidate = function(line) {
    var parts;
    // Parse both variants.
    if (line.indexOf('a=candidate:') === 0) {
        parts = line.substring(12).split(' ');
    } else {
        parts = line.substring(10).split(' ');
    }

    var candidate = {
        foundation: parts[0],
        component: parts[1],
        protocol: parts[2].toLowerCase(),
        priority: parseInt(parts[3], 10),
        ip: parts[4],
        port: parseInt(parts[5], 10),
        // skip parts[6] == 'typ'
        type: parts[7]
    };

    for (var i = 8; i < parts.length; i += 2) {
        switch (parts[i]) {
            case 'raddr':
                candidate.relatedAddress = parts[i + 1];
                break;
            case 'rport':
                candidate.relatedPort = parseInt(parts[i + 1], 10);
                break;
            case 'tcptype':
                candidate.tcpType = parts[i + 1];
                break;
            default: // Unknown extensions are silently ignored.
                break;
        }
    }
    return candidate;
};

// Translates a candidate object into SDP candidate attribute.
SDPUtils.writeCandidate = function(candidate) {
    var sdp = [];
    sdp.push(candidate.foundation);
    sdp.push(candidate.component);
    sdp.push(candidate.protocol.toUpperCase());
    sdp.push(candidate.priority);
    sdp.push(candidate.ip);
    sdp.push(candidate.port);

    var type = candidate.type;
    sdp.push('typ');
    sdp.push(type);
    if (type !== 'host' && candidate.relatedAddress &&
        candidate.relatedPort) {
        sdp.push('raddr');
        sdp.push(candidate.relatedAddress); // was: relAddr
        sdp.push('rport');
        sdp.push(candidate.relatedPort); // was: relPort
    }
    if (candidate.tcpType && candidate.protocol.toLowerCase() === 'tcp') {
        sdp.push('tcptype');
        sdp.push(candidate.tcpType);
    }
    return 'candidate:' + sdp.join(' ');
};

// Parses an rtpmap line, returns RTCRtpCoddecParameters. Sample input:
// a=rtpmap:111 opus/48000/2
SDPUtils.parseRtpMap = function(line) {
    var parts = line.substr(9).split(' ');
    var parsed = {
        payloadType: parseInt(parts.shift(), 10) // was: id
    };

    parts = parts[0].split('/');

    parsed.name = parts[0];
    parsed.clockRate = parseInt(parts[1], 10); // was: clockrate
    parsed.numChannels = parts.length === 3 ? parseInt(parts[2], 10) : 1; // was: channels
    return parsed;
};

// Generate an a=rtpmap line from RTCRtpCodecCapability or RTCRtpCodecParameters.
SDPUtils.writeRtpMap = function(codec) {
    var pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
    }
    return 'a=rtpmap:' + pt + ' ' + codec.name + '/' + codec.clockRate +
        (codec.numChannels !== 1 ? '/' + codec.numChannels : '') + '\r\n';
};

// Parses an ftmp line, returns dictionary. Sample input:
// a=fmtp:96 vbr=on;cng=on
// Also deals with vbr=on; cng=on
SDPUtils.parseFmtp = function(line) {
    var parsed = {};
    var kv;
    var parts = line.substr(line.indexOf(' ') + 1).split(';');
    for (var j = 0; j < parts.length; j++) {
        kv = parts[j].trim().split('=');
        parsed[kv[0].trim()] = kv[1];
    }
    return parsed;
};

// Generates an a=ftmp line from RTCRtpCodecCapability or RTCRtpCodecParameters.
SDPUtils.writeFtmp = function(codec) {
    var line = '';
    var pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
    }
    if (codec.parameters && codec.parameters.length) {
        var params = [];
        Object.keys(codec.parameters).forEach(function(param) {
            params.push(param + '=' + codec.parameters[param]);
        });
        line += 'a=fmtp:' + pt + ' ' + params.join(';') + '\r\n';
    }
    return line;
};

// Parses an rtcp-fb line, returns RTCPRtcpFeedback object. Sample input:
// a=rtcp-fb:98 nack rpsi
SDPUtils.parseRtcpFb = function(line) {
    var parts = line.substr(line.indexOf(' ') + 1).split(' ');
    return {
        type: parts.shift(),
        parameter: parts.join(' ')
    };
};
// Generate a=rtcp-fb lines from RTCRtpCodecCapability or RTCRtpCodecParameters.
SDPUtils.writeRtcpFb = function(codec) {
    var lines = '';
    var pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
    }
    if (codec.rtcpFeedback && codec.rtcpFeedback.length) {
        // FIXME: special handling for trr-int?
        codec.rtcpFeedback.forEach(function(fb) {
            lines += 'a=rtcp-fb:' + pt + ' ' + fb.type + ' ' + fb.parameter +
                '\r\n';
        });
    }
    return lines;
};

SDPUtils.parseSsrc = function(sdp,type){
    var sections = SDPUtils.splitSections(sdp);
    var ssrc = [];
    sections.forEach(function(mediaSect,sdpMlenIndex)
    {
        var remoteSsrc = SDPUtils.matchPrefix(mediaSect, 'a=ssrc:')
            .map(function(line) {
                return SDPUtils.parseSsrcMedia(line);
            })
            .filter(function(obj) {
                return obj.attribute === 'cname';
            })[0];
        SDPUtils.matchPrefix(mediaSect, 'm=')
            .map(function(line){
                var sp = line.indexOf(' ');
                var mt = line.substr(2,sp-2);
                if(mt === type)
                {
                    ssrc.push(remoteSsrc);
                }

            })
    });
    return ssrc;
}
// Parses an RFC 5576 ssrc media attribute. Sample input:
// a=ssrc:3735928559 cname:something
SDPUtils.parseSsrcMedia = function(line) {
    var sp = line.indexOf(' ');
    var parts = {
        ssrc: line.substr(7, sp - 7),
    };
    var colon = line.indexOf(':', sp);
    if (colon > -1) {
        parts.attribute = line.substr(sp + 1, colon - sp - 1);
        parts.value = line.substr(colon + 1);
    } else {
        parts.attribute = line.substr(sp + 1);
    }
    return parts;
};

// Extracts DTLS parameters from SDP media section or sessionpart.
// FIXME: for consistency with other functions this should only
//   get the fingerprint line as input. See also getIceParameters.
SDPUtils.getDtlsParameters = function(mediaSection, sessionpart) {
    var lines = SDPUtils.splitLines(mediaSection);
    lines = lines.concat(SDPUtils.splitLines(sessionpart)); // Search in session part, too.
    var fpLine = lines.filter(function(line) {
        return line.indexOf('a=fingerprint:') === 0;
    })[0].substr(14);
    // Note: a=setup line is ignored since we use the 'auto' role.
    var dtlsParameters = {
        role: 'auto',
        fingerprints: [{
            algorithm: fpLine.split(' ')[0],
            value: fpLine.split(' ')[1]
        }]
    };
    return dtlsParameters;
};

// Serializes DTLS parameters to SDP.
SDPUtils.writeDtlsParameters = function(params, setupType) {
    var sdp = 'a=setup:' + setupType + '\r\n';
    params.fingerprints.forEach(function(fp) {
        sdp += 'a=fingerprint:' + fp.algorithm + ' ' + fp.value + '\r\n';
    });
    return sdp;
};
// Parses ICE information from SDP media section or sessionpart.
// FIXME: for consistency with other functions this should only
//   get the ice-ufrag and ice-pwd lines as input.
SDPUtils.getIceParameters = function(mediaSection, sessionpart) {
    var lines = SDPUtils.splitLines(mediaSection);
    lines = lines.concat(SDPUtils.splitLines(sessionpart)); // Search in session part, too.
    var iceParameters = {
        usernameFragment: lines.filter(function(line) {
            return line.indexOf('a=ice-ufrag:') === 0;
        })[0].substr(12),
        password: lines.filter(function(line) {
            return line.indexOf('a=ice-pwd:') === 0;
        })[0].substr(10)
    };
    return iceParameters;
};

// Serializes ICE parameters to SDP.
SDPUtils.writeIceParameters = function(params) {
    return 'a=ice-ufrag:' + params.usernameFragment + '\r\n' +
        'a=ice-pwd:' + params.password + '\r\n';
};

// Parses the SDP media section and returns RTCRtpParameters.
SDPUtils.parseRtpParameters = function(mediaSection) {
    var description = {
        codecs: [],
        headerExtensions: [],
        fecMechanisms: [],
        rtcp: []
    };
    var lines = SDPUtils.splitLines(mediaSection);
    var mline = lines[0].split(' ');
    for (var i = 3; i < mline.length; i++) { // find all codecs from mline[3..]
        var pt = mline[i];
        var rtpmapline = SDPUtils.matchPrefix(
            mediaSection, 'a=rtpmap:' + pt + ' ')[0];
        if (rtpmapline) {
            var codec = SDPUtils.parseRtpMap(rtpmapline);
            var fmtps = SDPUtils.matchPrefix(
                mediaSection, 'a=fmtp:' + pt + ' ');
            // Only the first a=fmtp:<pt> is considered.
            codec.parameters = fmtps.length ? SDPUtils.parseFmtp(fmtps[0]) : {};
            codec.rtcpFeedback = SDPUtils.matchPrefix(
                mediaSection, 'a=rtcp-fb:' + pt + ' ')
                .map(SDPUtils.parseRtcpFb);
            description.codecs.push(codec);
        }
    }
    // FIXME: parse headerExtensions, fecMechanisms and rtcp.
    return description;
};

// Generates parts of the SDP media section describing the capabilities / parameters.
SDPUtils.writeRtpDescription = function(kind, caps) {
    var sdp = '';

    // Build the mline.
    sdp += 'm=' + kind + ' ';
    sdp += caps.codecs.length > 0 ? '9' : '0'; // reject if no codecs.
    sdp += ' UDP/TLS/RTP/SAVPF ';
    sdp += caps.codecs.map(function(codec) {
            if (codec.preferredPayloadType !== undefined) {
                return codec.preferredPayloadType;
            }
            return codec.payloadType;
        }).join(' ') + '\r\n';

    sdp += 'c=IN IP4 0.0.0.0\r\n';
    sdp += 'a=rtcp:9 IN IP4 0.0.0.0\r\n';

    // Add a=rtpmap lines for each codec. Also fmtp and rtcp-fb.
    caps.codecs.forEach(function(codec) {
        sdp += SDPUtils.writeRtpMap(codec);
        sdp += SDPUtils.writeFtmp(codec);
        sdp += SDPUtils.writeRtcpFb(codec);
    });
    // FIXME: add headerExtensions, fecMechanismş and rtcp.
    sdp += 'a=rtcp-mux\r\n';
    return sdp;
};

SDPUtils.writeSessionBoilerplate = function() {
    // FIXME: sess-id should be an NTP timestamp.
    return 'v=0\r\n' +
        'o=thisisadapterortc 8169639915646943137 2 IN IP4 127.0.0.1\r\n' +
        's=-\r\n' +
        't=0 0\r\n';
};

SDPUtils.writeMediaSection = function(transceiver, caps, type, stream) {
    var sdp = SDPUtils.writeRtpDescription(transceiver.kind, caps);

    // Map ICE parameters (ufrag, pwd) to SDP.
    sdp += SDPUtils.writeIceParameters(
        transceiver.iceGatherer.getLocalParameters());

    // Map DTLS parameters to SDP.
    sdp += SDPUtils.writeDtlsParameters(
        transceiver.dtlsTransport.getLocalParameters(),
        type === 'offer' ? 'actpass' : 'active');

    sdp += 'a=mid:' + transceiver.mid + '\r\n';

    if (transceiver.rtpSender && transceiver.rtpReceiver) {
        sdp += 'a=sendrecv\r\n';
    } else if (transceiver.rtpSender) {
        sdp += 'a=sendonly\r\n';
    } else if (transceiver.rtpReceiver) {
        sdp += 'a=recvonly\r\n';
    } else {
        sdp += 'a=inactive\r\n';
    }

    // FIXME: for RTX there might be multiple SSRCs. Not implemented in Edge yet.
    if (transceiver.rtpSender) {
        var msid = 'msid:' + stream.id + ' ' +
            transceiver.rtpSender.track.id + '\r\n';
        sdp += 'a=' + msid;
        sdp += 'a=ssrc:' + transceiver.sendSsrc + ' ' + msid;
    }
    // FIXME: this should be written by writeRtpDescription.
    sdp += 'a=ssrc:' + transceiver.sendSsrc + ' cname:' +
        localCName + '\r\n';
    return sdp;
};

// Gets the direction from the mediaSection or the sessionpart.
SDPUtils.getDirection = function(mediaSection, sessionpart) {
    // Look for sendrecv, sendonly, recvonly, inactive, default to sendrecv.
    var lines = SDPUtils.splitLines(mediaSection);
    for (var i = 0; i < lines.length; i++) {
        switch (lines[i]) {
            case 'a=sendrecv':
            case 'a=sendonly':
            case 'a=recvonly':
            case 'a=inactive':
                return lines[i].substr(2);
        }
    }
    if (sessionpart) {
        return SDPUtils.getDirection(sessionpart);
    }
    return 'sendrecv';
};

// Screensharing Chrome Extension ID
Janus.extensionId = "hapfgfdkleiggjjpfpenajgdnfckjpaj";
Janus.isExtensionEnabled = function() {
    if(window.navigator.userAgent.match('Chrome')) {
        var chromever = parseInt(window.navigator.userAgent.match(/Chrome\/(.*) /)[1], 10);
        var maxver = 33;
        if(window.navigator.userAgent.match('Linux'))
            maxver = 35;	// "known" crash in chrome 34 and 35 on linux
        if(chromever >= 26 && chromever <= maxver) {
            // Older versions of Chrome don't support this extension-based approach, so lie
            return true;
        }
        return ($('#janus-extension-installed').length > 0);
    } else {
        // Firefox of others, no need for the extension (but this doesn't mean it will work)
        return true;
    }
};

Janus.noop = function() {};

// Initialization
Janus.init = function(options) {
    options = options || {};
    options.callback = (typeof options.callback == "function") ? options.callback : Janus.noop;
    if(Janus.initDone === true) {
        // Already initialized
        options.callback();
    } else {
        if(typeof console == "undefined" || typeof console.log == "undefined")
            console = { log: function() {} };
        // Console logging (all debugging disabled by default)
        Janus.trace = Janus.noop;
        Janus.debug = Janus.noop;
        Janus.vdebug = Janus.noop;
        Janus.log = Janus.noop;
        Janus.warn = Janus.noop;
        Janus.error = Janus.noop;
        if(options.debug === true || options.debug === "all") {
            // Enable all debugging levels
            Janus.trace = console.trace.bind(console);
            Janus.debug = console.debug.bind(console);
            Janus.vdebug = console.debug.bind(console);
            Janus.log = console.log.bind(console);
            Janus.warn = console.warn.bind(console);
            Janus.error = console.error.bind(console);
        } else if(Array.isArray(options.debug)) {
            for(var i in options.debug) {
                var d = options.debug[i];
                switch(d) {
                    case "trace":
                        Janus.trace = console.trace.bind(console);
                        break;
                    case "debug":
                        Janus.debug = console.debug.bind(console);
                        break;
                    case "vdebug":
                        Janus.vdebug = console.debug.bind(console);
                        break;
                    case "log":
                        Janus.log = console.log.bind(console);
                        break;
                    case "warn":
                        Janus.warn = console.warn.bind(console);
                        break;
                    case "error":
                        Janus.error = console.error.bind(console);
                        break;
                    default:
                        console.error("Unknown debugging option '" + d + "' (supported: 'trace', 'debug', 'vdebug', 'log', warn', 'error')");
                        break;
                }
            }
        }
        Janus.log("Initializing library");
        // Helper method to enumerate devices
        Janus.listDevices = function(callback, config) {
            callback = (typeof callback == "function") ? callback : Janus.noop;
            if (config == null) config = { audio: true, video: true };
            if(navigator.mediaDevices) {
                navigator.mediaDevices.getUserMedia(config)
                    .then(function(stream) {
                        navigator.mediaDevices.enumerateDevices().then(function(devices) {
                            Janus.debug(devices);
                            callback(devices);
                            // Get rid of the now useless stream
                            try {
                                stream.stop();
                            } catch(e) {}
                            try {
                                var tracks = stream.getTracks();
                                for(var i in tracks) {
                                    var mst = tracks[i];
                                    if(mst !== null && mst !== undefined)
                                        mst.stop();
                                }
                            } catch(e) {}
                        });
                    })
                    .catch(function(err) {
                        Janus.error(err);
                        callback([]);
                    });
            } else {
                Janus.warn("navigator.mediaDevices unavailable");
                callback([]);
            }
        }
        // Helper methods to attach/reattach a stream to a video element (previously part of adapter.js)
        Janus.attachMediaStream = function(element, stream) {
            if(adapter.browserDetails.browser === 'chrome') {
                var chromever = adapter.browserDetails.version;
                if(chromever >= 43) {
                    element.srcObject = stream;
                } else if(typeof element.src !== 'undefined') {
                    element.src = URL.createObjectURL(stream);
                } else {
                    Janus.error("Error attaching stream to element");
                }
            } else {
                element.srcObject = stream;
            }
        };
        Janus.reattachMediaStream = function(to, from) {
            if(adapter.browserDetails.browser === 'chrome') {
                var chromever = adapter.browserDetails.version;
                if(chromever >= 43) {
                    to.srcObject = from.srcObject;
                } else if(typeof to.src !== 'undefined') {
                    to.src = from.src;
                } else {
                    Janus.error("Error reattaching stream to element");
                }
            } else {
                to.srcObject = from.srcObject;
            }
        };
        // Detect tab close: make sure we don't loose existing onbeforeunload handlers
        var oldOBF = window.onbeforeunload;
        window.onbeforeunload = function() {
            Janus.log("Closing window");
            for(var s in Janus.sessions) {
                if(Janus.sessions[s] !== null && Janus.sessions[s] !== undefined &&
                    Janus.sessions[s].destroyOnUnload) {
                    Janus.log("Destroying session " + s);
                    Janus.sessions[s].destroy({asyncRequest: false});
                }
            }
            if(oldOBF && typeof oldOBF == "function")
                oldOBF();
        }
        Janus.initDone = true;
        options.callback();
    }
};

// Helper method to check whether WebRTC is supported by this browser
Janus.isWebrtcSupported = function() {
    return window.RTCPeerConnection !== undefined && window.RTCPeerConnection !== null &&
        navigator.getUserMedia !== undefined && navigator.getUserMedia !== null;
};

// Helper method to create random identifiers (e.g., transaction)
Janus.randomString = function(len) {
    var charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < len; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}


function Janus(gatewayCallbacks) {
    if(Janus.initDone === undefined) {
        gatewayCallbacks.error("Library not initialized");
        return {};
    }
    if(!Janus.isWebrtcSupported()) {
        gatewayCallbacks.error("WebRTC not supported by this browser");
        return {};
    }
    Janus.log("Library initialized: " + Janus.initDone);
    gatewayCallbacks = gatewayCallbacks || {};
    gatewayCallbacks.success = (typeof gatewayCallbacks.success == "function") ? gatewayCallbacks.success : jQuery.noop;
    gatewayCallbacks.error = (typeof gatewayCallbacks.error == "function") ? gatewayCallbacks.error : jQuery.noop;
    gatewayCallbacks.destroyed = (typeof gatewayCallbacks.destroyed == "function") ? gatewayCallbacks.destroyed : jQuery.noop;
    if(gatewayCallbacks.server === null || gatewayCallbacks.server === undefined) {
        gatewayCallbacks.error("Invalid gateway url");
        return {};
    }
    var websockets = false;
    var ws = null;
    var wsHandlers = {};
    var wsKeepaliveTimeoutId = null;

    var servers = null, serversIndex = 0;
    var server = gatewayCallbacks.server;
    if($.isArray(server)) {
        Janus.log("Multiple servers provided (" + server.length + "), will use the first that works");
        server = null;
        servers = gatewayCallbacks.server;
        Janus.debug(servers);
    } else {
        if(server.indexOf("ws") === 0) {
            websockets = true;
            Janus.log("Using WebSockets to contact Janus: " + server);
        } else {
            websockets = false;
            Janus.log("Using REST API to contact Janus: " + server);
        }
    }
    var iceServers = gatewayCallbacks.iceServers;
    if(iceServers === undefined || iceServers === null)
        iceServers = [{urls: "stun:stun.l.google.com:19302"}];
    var iceTransportPolicy = gatewayCallbacks.iceTransportPolicy;
    var bundlePolicy = gatewayCallbacks.bundlePolicy;
    if(!bundlePolicy)
        bundlePolicy = "max-bundle";
    // Whether IPv6 candidates should be gathered
    var ipv6Support = gatewayCallbacks.ipv6;
    if(ipv6Support === undefined || ipv6Support === null)
        ipv6Support = false;
    // Whether we should enable the withCredentials flag for XHR requests
    var withCredentials = false;
    if(gatewayCallbacks.withCredentials !== undefined && gatewayCallbacks.withCredentials !== null)
        withCredentials = gatewayCallbacks.withCredentials === true;
    // Optional max events
    var maxev = null;
    if(gatewayCallbacks.max_poll_events !== undefined && gatewayCallbacks.max_poll_events !== null)
        maxev = gatewayCallbacks.max_poll_events;
    if(maxev < 1)
        maxev = 1;
    // Token to use (only if the token based authentication mechanism is enabled)
    var token = null;
    if(gatewayCallbacks.token !== undefined && gatewayCallbacks.token !== null)
        token = gatewayCallbacks.token;
    // API secret to use (only if the shared API secret is enabled)
    var apisecret = null;
    if(gatewayCallbacks.apisecret !== undefined && gatewayCallbacks.apisecret !== null)
        apisecret = gatewayCallbacks.apisecret;
    // Whether we should destroy this session when onbeforeunload is called
    this.destroyOnUnload = true;
    if(gatewayCallbacks.destroyOnUnload !== undefined && gatewayCallbacks.destroyOnUnload !== null)
        this.destroyOnUnload = (gatewayCallbacks.destroyOnUnload === true);

    var connected = false;
    var sessionId = null;
    var pluginHandles = {};
    var that = this;
    var retries = 0;
    var transactions = {};
    createSession(gatewayCallbacks);

    // Public methods
    this.getServer = function() { return server; };
    this.isConnected = function() { return connected; };
    this.getSessionId = function() { return sessionId; };
    this.destroy = function(callbacks) { destroySession(callbacks); };
    this.attach = function(callbacks) { createHandle(callbacks); };

    function eventHandler() {
        if(sessionId == null)
            return;
        Janus.debug('Long poll...');
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            return;
        }
        var longpoll = server + "/" + sessionId + "?rid=" + new Date().getTime();
        if(maxev !== undefined && maxev !== null)
            longpoll = longpoll + "&maxev=" + maxev;
        if(token !== null && token !== undefined)
            longpoll = longpoll + "&token=" + token;
        if(apisecret !== null && apisecret !== undefined)
            longpoll = longpoll + "&apisecret=" + apisecret;
        $.ajax({
            type: 'GET',
            url: longpoll,
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            timeout: 60000,	// FIXME
            success: handleEvent,
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);
                retries++;
                if(retries > 3) {
                    // Did we just lose the gateway? :-(
                    connected = false;
                    gatewayCallbacks.error("Lost connection to the gateway (is it down?)");
                    return;
                }
                eventHandler();
            },
            dataType: "json"
        });
    }

    // Private event handler: this will trigger plugin callbacks, if set
    function handleEvent(json, skipTimeout) {
        retries = 0;
        if(!websockets && sessionId !== undefined && sessionId !== null && skipTimeout !== true)
            setTimeout(eventHandler, 200);
        if(!websockets && $.isArray(json)) {
            // We got an array: it means we passed a maxev > 1, iterate on all objects
            for(var i=0; i<json.length; i++) {
                handleEvent(json[i], true);
            }
            return;
        }
        if(json["janus"] === "keepalive") {
            // Nothing happened
            Janus.vdebug("Got a keepalive on session " + sessionId);
            return;
        } else if(json["janus"] === "ack") {
            // Just an ack, we can probably ignore
            Janus.debug("Got an ack on session " + sessionId);
            Janus.debug(json);
            var transaction = json["transaction"];
            if(transaction !== null && transaction !== undefined) {
                var reportSuccess = transactions[transaction];
                if(reportSuccess !== null && reportSuccess !== undefined) {
                    reportSuccess(json);
                }
                delete transactions[transaction];
            }
            return;
        } else if(json["janus"] === "success") {
            // Success!
            Janus.debug("Got a success on session " + sessionId);
            Janus.debug(json);
            var transaction = json["transaction"];
            if(transaction !== null && transaction !== undefined) {
                var reportSuccess = transactions[transaction];
                if(reportSuccess !== null && reportSuccess !== undefined) {
                    reportSuccess(json);
                }
                delete transactions[transaction];
            }
            return;
        } else if(json["janus"] === "webrtcup") {
            // The PeerConnection with the gateway is up! Notify this
            Janus.debug("Got a webrtcup event on session " + sessionId);
            Janus.debug(json);
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                Janus.debug("This handle is not attached to this session");
                return;
            }
            pluginHandle.webrtcState(true);
            return;
        } else if(json["janus"] === "hangup") {
            // A plugin asked the core to hangup a PeerConnection on one of our handles
            Janus.debug("Got a hangup event on session " + sessionId);
            Janus.debug(json);
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                Janus.debug("This handle is not attached to this session");
                return;
            }
            pluginHandle.webrtcState(false, json["reason"]);
            pluginHandle.hangup();
        } else if(json["janus"] === "detached") {
            // A plugin asked the core to detach one of our handles
            Janus.debug("Got a detached event on session " + sessionId);
            Janus.debug(json);
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                // Don't warn here because destroyHandle causes this situation.
                return;
            }
            pluginHandle.detached = true;
            pluginHandle.ondetached();
            pluginHandle.detach();
        } else if(json["janus"] === "media") {
            // Media started/stopped flowing
            Janus.debug("Got a media event on session " + sessionId);
            Janus.debug(json);
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                Janus.debug("This handle is not attached to this session");
                return;
            }
            pluginHandle.mediaState(json["type"], json["receiving"]);
        } else if(json["janus"] === "slowlink") {
            Janus.debug("Got a slowlink event on session " + sessionId);
            Janus.debug(json);
            // Trouble uplink or downlink
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                Janus.debug("This handle is not attached to this session");
                return;
            }
            pluginHandle.slowLink(json["uplink"], json["nacks"]);
        } else if(json["janus"] === "error") {
            // Oops, something wrong happened
            Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
            Janus.debug(json);
            var transaction = json["transaction"];
            if(transaction !== null && transaction !== undefined) {
                var reportSuccess = transactions[transaction];
                if(reportSuccess !== null && reportSuccess !== undefined) {
                    reportSuccess(json);
                }
                delete transactions[transaction];
            }
            return;
        } else if(json["janus"] === "event") {
            Janus.debug("Got a plugin event on session " + sessionId);
            Janus.debug(json);
            var sender = json["sender"];
            if(sender === undefined || sender === null) {
                Janus.warn("Missing sender...");
                return;
            }
            var plugindata = json["plugindata"];
            if(plugindata === undefined || plugindata === null) {
                Janus.warn("Missing plugindata...");
                return;
            }
            Janus.debug("  -- Event is coming from " + sender + " (" + plugindata["plugin"] + ")");
            var data = plugindata["data"];
            Janus.debug(data);
            var pluginHandle = pluginHandles[sender];
            if(pluginHandle === undefined || pluginHandle === null) {
                Janus.warn("This handle is not attached to this session");
                return;
            }
            var jsep = json["jsep"];
            if(jsep !== undefined && jsep !== null) {
                Janus.debug("Handling SDP as well...");
                Janus.debug(jsep);
            }
            var callback = pluginHandle.onmessage;
            if(callback !== null && callback !== undefined) {
                Janus.debug("Notifying application...");
                // Send to callback specified when attaching plugin handle
                callback(data, jsep);
            } else {
                // Send to generic callback (?)
                Janus.debug("No provided notification callback");
            }
        } else {
            Janus.warn("Unkown message/event  '" + json["janus"] + "' on session " + sessionId);
            Janus.debug(json);
        }
    }

    // Private helper to send keep-alive messages on WebSockets
    function keepAlive() {
        if(server === null || !websockets || !connected)
            return;
        wsKeepaliveTimeoutId = setTimeout(keepAlive, 30000);
        var request = { "janus": "keepalive", "session_id": sessionId, "transaction": Janus.randomString(12) };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        ws.send(JSON.stringify(request));
    }

    // Private method to create a session
    function createSession(callbacks) {
        var transaction = Janus.randomString(12);
        var request = { "janus": "create", "transaction": transaction };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        if(server === null && $.isArray(servers)) {
            // We still need to find a working server from the list we were given
            server = servers[serversIndex];
            if(server.indexOf("ws") === 0) {
                websockets = true;
                Janus.log("Server #" + (serversIndex+1) + ": trying WebSockets to contact Janus (" + server + ")");
            } else {
                websockets = false;
                Janus.log("Server #" + (serversIndex+1) + ": trying REST API to contact Janus (" + server + ")");
            }
        }
        if(websockets) {
            ws = new WebSocket(server, 'janus-protocol');
            wsHandlers = {
                'error': function() {
                    Janus.error("Error connecting to the Janus WebSockets server... " + server);
                    if ($.isArray(servers)) {
                        serversIndex++;
                        if (serversIndex == servers.length) {
                            // We tried all the servers the user gave us and they all failed
                            callbacks.error("Error connecting to any of the provided Janus servers: Is the gateway down?");
                            return;
                        }
                        // Let's try the next server
                        server = null;
                        setTimeout(function() {
                            createSession(callbacks);
                        }, 200);
                        return;
                    }
                    callbacks.error("Error connecting to the Janus WebSockets server: Is the gateway down?");
                },

                'open': function() {
                    // We need to be notified about the success
                    transactions[transaction] = function(json) {
                        Janus.debug(json);
                        if (json["janus"] !== "success") {
                            Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                            callbacks.error(json["error"].reason);
                            return;
                        }
                        wsKeepaliveTimeoutId = setTimeout(keepAlive, 30000);
                        connected = true;
                        sessionId = json.data["id"];
                        Janus.log("Created session: " + sessionId);
                        Janus.sessions[sessionId] = that;
                        callbacks.success();
                    };
                    ws.send(JSON.stringify(request));
                },

                'message': function(event) {
                    handleEvent(JSON.parse(event.data));
                },

                'close': function() {
                    if (server === null || !connected) {
                        return;
                    }
                    connected = false;
                    // FIXME What if this is called when the page is closed?
                    gatewayCallbacks.error("Lost connection to the gateway (is it down?)");
                }
            };

            for(var eventName in wsHandlers) {
                ws.addEventListener(eventName, wsHandlers[eventName]);
            }

            return;
        }
        $.ajax({
            type: 'POST',
            url: server,
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.debug(json);
                if(json["janus"] !== "success") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                    callbacks.error(json["error"].reason);
                    return;
                }
                connected = true;
                sessionId = json.data["id"];
                Janus.log("Created session: " + sessionId);
                Janus.sessions[sessionId] = that;
                eventHandler();
                callbacks.success();
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
                if($.isArray(servers)) {
                    serversIndex++;
                    if(serversIndex == servers.length) {
                        // We tried all the servers the user gave us and they all failed
                        callbacks.error("Error connecting to any of the provided Janus servers: Is the gateway down?");
                        return;
                    }
                    // Let's try the next server
                    server = null;
                    setTimeout(function() { createSession(callbacks); }, 200);
                    return;
                }
                if(errorThrown === "")
                    callbacks.error(textStatus + ": Is the gateway down?");
                else
                    callbacks.error(textStatus + ": " + errorThrown);
            },
            dataType: "json"
        });
    }

    // Private method to destroy a session
    function destroySession(callbacks) {
        callbacks = callbacks || {};
        // FIXME This method triggers a success even when we fail
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        var asyncRequest = true;
        if(callbacks.asyncRequest !== undefined && callbacks.asyncRequest !== null)
            asyncRequest = (callbacks.asyncRequest === true);
        Janus.log("Destroying session " + sessionId + " (async=" + asyncRequest + ")");
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            callbacks.success();
            return;
        }
        if(sessionId === undefined || sessionId === null) {
            Janus.warn("No session to destroy");
            callbacks.success();
            gatewayCallbacks.destroyed();
            return;
        }
        delete Janus.sessions[sessionId];
        // No need to destroy all handles first, Janus will do that itself
        var request = { "janus": "destroy", "transaction": Janus.randomString(12) };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        if(websockets) {
            request["session_id"] = sessionId;

            var unbindWebSocket = function() {
                for(var eventName in wsHandlers) {
                    ws.removeEventListener(eventName, wsHandlers[eventName]);
                }
                ws.removeEventListener('message', onUnbindMessage);
                ws.removeEventListener('error', onUnbindError);
                if(wsKeepaliveTimeoutId) {
                    clearTimeout(wsKeepaliveTimeoutId);
                }
            };

            var onUnbindMessage = function(event){
                var data = JSON.parse(event.data);
                if(data.session_id == request.session_id && data.transaction == request.transaction) {
                    unbindWebSocket();
                    callbacks.success();
                    gatewayCallbacks.destroyed();
                }
            };
            var onUnbindError = function(event) {
                unbindWebSocket();
                callbacks.error("Failed to destroy the gateway: Is the gateway down?");
                gatewayCallbacks.destroyed();
            };

            ws.addEventListener('message', onUnbindMessage);
            ws.addEventListener('error', onUnbindError);

            ws.send(JSON.stringify(request));
            return;
        }
        $.ajax({
            type: 'POST',
            url: server + "/" + sessionId,
            async: asyncRequest,	// Sometimes we need false here, or destroying in onbeforeunload won't work
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.log("Destroyed session:");
                Janus.debug(json);
                sessionId = null;
                connected = false;
                if(json["janus"] !== "success") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                }
                callbacks.success();
                gatewayCallbacks.destroyed();
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
                // Reset everything anyway
                sessionId = null;
                connected = false;
                callbacks.success();
                gatewayCallbacks.destroyed();
            },
            dataType: "json"
        });
    }

    // Private method to create a plugin handle
    function createHandle(callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        callbacks.consentDialog = (typeof callbacks.consentDialog == "function") ? callbacks.consentDialog : jQuery.noop;
        callbacks.iceState = (typeof callbacks.iceState == "function") ? callbacks.iceState : jQuery.noop;
        callbacks.mediaState = (typeof callbacks.mediaState == "function") ? callbacks.mediaState : jQuery.noop;
        callbacks.webrtcState = (typeof callbacks.webrtcState == "function") ? callbacks.webrtcState : jQuery.noop;
        callbacks.slowLink = (typeof callbacks.slowLink == "function") ? callbacks.slowLink : jQuery.noop;
        callbacks.onmessage = (typeof callbacks.onmessage == "function") ? callbacks.onmessage : jQuery.noop;
        callbacks.onlocalstream = (typeof callbacks.onlocalstream == "function") ? callbacks.onlocalstream : jQuery.noop;
        callbacks.onremotestream = (typeof callbacks.onremotestream == "function") ? callbacks.onremotestream : jQuery.noop;
        callbacks.ondata = (typeof callbacks.ondata == "function") ? callbacks.ondata : jQuery.noop;
        callbacks.ondataopen = (typeof callbacks.ondataopen == "function") ? callbacks.ondataopen : jQuery.noop;
        callbacks.oncleanup = (typeof callbacks.oncleanup == "function") ? callbacks.oncleanup : jQuery.noop;
        callbacks.ondetached = (typeof callbacks.ondetached == "function") ? callbacks.ondetached : jQuery.noop;
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            callbacks.error("Is the gateway down? (connected=false)");
            return;
        }
        var plugin = callbacks.plugin;
        if(plugin === undefined || plugin === null) {
            Janus.error("Invalid plugin");
            callbacks.error("Invalid plugin");
            return;
        }
        var opaqueId = callbacks.opaqueId;
        var transaction = Janus.randomString(12);
        var request = { "janus": "attach", "plugin": plugin, "opaque_id": opaqueId, "transaction": transaction };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        // If we know the browser supports BUNDLE and/or rtcp-mux, let's advertise those right away
        if(adapter.browserDetails.browser == "chrome" || adapter.browserDetails.browser == "firefox" ||
            adapter.browserDetails.browser == "safari") {
            request["force-bundle"] = true;
            request["force-rtcp-mux"] = true;
        }
        if(websockets) {
            transactions[transaction] = function(json) {
                Janus.debug(json);
                if(json["janus"] !== "success") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                    callbacks.error("Ooops: " + json["error"].code + " " + json["error"].reason);
                    return;
                }
                var handleId = json.data["id"];
                Janus.log("Created handle: " + handleId);
                var pluginHandle =
                {
                    session : that,
                    plugin : plugin,
                    id : handleId,
                    detached : false,
                    webrtcStuff : {
                        started : false,
                        myStream : null,
                        streamExternal : false,
                        remoteStream : null,
                        mySdp : null,
                        pc : null,
                        dataChannel : null,
                        dtmfSender : null,
                        trickle : true,
                        iceDone : false,
                        sdpSent : false,
                        volume : {
                            value : null,
                            timer : null
                        },
                        bitrate : {
                            value : null,
                            bsnow : null,
                            bsbefore : null,
                            tsnow : null,
                            tsbefore : null,
                            timer : null
                        }
                    },
                    getId : function() { return handleId; },
                    getPlugin : function() { return plugin; },
                    getVolume : function() { return getVolume(handleId); },
                    isAudioMuted : function() { return isMuted(handleId, false); },
                    muteAudio : function() { return mute(handleId, false, true); },
                    unmuteAudio : function() { return mute(handleId, false, false); },
                    isVideoMuted : function() { return isMuted(handleId, true); },
                    muteVideo : function() { return mute(handleId, true, true); },
                    unmuteVideo : function() { return mute(handleId, true, false); },
                    getBitrate : function() { return getBitrate(handleId); },
                    send : function(callbacks) { sendMessage(handleId, callbacks); },
                    data : function(callbacks) { sendData(handleId, callbacks); },
                    dtmf : function(callbacks) { sendDtmf(handleId, callbacks); },
                    consentDialog : callbacks.consentDialog,
                    iceState : callbacks.iceState,
                    mediaState : callbacks.mediaState,
                    webrtcState : callbacks.webrtcState,
                    slowLink : callbacks.slowLink,
                    onmessage : callbacks.onmessage,
                    createOffer : function(callbacks) { prepareWebrtc(handleId, callbacks); },
                    createAnswer : function(callbacks) { prepareWebrtc(handleId, callbacks ); },
                    handleRemoteJsep : function(callbacks) { prepareWebrtcPeer(handleId, callbacks); },
                    onlocalstream : callbacks.onlocalstream,
                    onremotestream : callbacks.onremotestream,
                    ondata : callbacks.ondata,
                    ondataopen : callbacks.ondataopen,
                    oncleanup : callbacks.oncleanup,
                    ondetached : callbacks.ondetached,
                    hangup : function(sendRequest) { cleanupWebrtc(handleId, sendRequest === true); },
                    detach : function(callbacks) { destroyHandle(handleId, callbacks); }
                }
                pluginHandles[handleId] = pluginHandle;
                callbacks.success(pluginHandle);
            };
            request["session_id"] = sessionId;
            ws.send(JSON.stringify(request));
            return;
        }
        $.ajax({
            type: 'POST',
            url: server + "/" + sessionId,
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.debug(json);
                if(json["janus"] !== "success") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                    callbacks.error("Ooops: " + json["error"].code + " " + json["error"].reason);
                    return;
                }
                var handleId = json.data["id"];
                Janus.log("Created handle: " + handleId);
                var pluginHandle =
                {
                    session : that,
                    plugin : plugin,
                    id : handleId,
                    detached : false,
                    webrtcStuff : {
                        started : false,
                        myStream : null,
                        streamExternal : false,
                        remoteStream : null,
                        mySdp : null,
                        pc : null,
                        dataChannel : null,
                        dtmfSender : null,
                        trickle : true,
                        iceDone : false,
                        sdpSent : false,
                        volume : {
                            value : null,
                            timer : null
                        },
                        bitrate : {
                            value : null,
                            bsnow : null,
                            bsbefore : null,
                            tsnow : null,
                            tsbefore : null,
                            timer : null
                        }
                    },
                    getId : function() { return handleId; },
                    getPlugin : function() { return plugin; },
                    getVolume : function() { return getVolume(handleId); },
                    isAudioMuted : function() { return isMuted(handleId, false); },
                    muteAudio : function() { return mute(handleId, false, true); },
                    unmuteAudio : function() { return mute(handleId, false, false); },
                    isVideoMuted : function() { return isMuted(handleId, true); },
                    muteVideo : function() { return mute(handleId, true, true); },
                    unmuteVideo : function() { return mute(handleId, true, false); },
                    getBitrate : function() { return getBitrate(handleId); },
                    send : function(callbacks) { sendMessage(handleId, callbacks); },
                    data : function(callbacks) { sendData(handleId, callbacks); },
                    dtmf : function(callbacks) { sendDtmf(handleId, callbacks); },
                    consentDialog : callbacks.consentDialog,
                    iceState : callbacks.iceState,
                    mediaState : callbacks.mediaState,
                    webrtcState : callbacks.webrtcState,
                    slowLink : callbacks.slowLink,
                    onmessage : callbacks.onmessage,
                    createOffer : function(callbacks) { prepareWebrtc(handleId, callbacks); },
                    createAnswer : function(callbacks) { prepareWebrtc(handleId, callbacks); },
                    handleRemoteJsep : function(callbacks) { prepareWebrtcPeer(handleId, callbacks); },
                    onlocalstream : callbacks.onlocalstream,
                    onremotestream : callbacks.onremotestream,
                    ondata : callbacks.ondata,
                    ondataopen : callbacks.ondataopen,
                    oncleanup : callbacks.oncleanup,
                    ondetached : callbacks.ondetached,
                    hangup : function(sendRequest) { cleanupWebrtc(handleId, sendRequest === true); },
                    detach : function(callbacks) { destroyHandle(handleId, callbacks); }
                }
                pluginHandles[handleId] = pluginHandle;
                callbacks.success(pluginHandle);
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
            },
            dataType: "json"
        });
    }

    // Private method to send a message
    function sendMessage(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            callbacks.error("Is the gateway down? (connected=false)");
            return;
        }
        var message = callbacks.message;
        var jsep = callbacks.jsep;
        var transaction = Janus.randomString(12);
        var request = { "janus": "message", "body": message, "transaction": transaction };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        if(jsep !== null && jsep !== undefined)
            request.jsep = jsep;
        Janus.debug("Sending message to plugin (handle=" + handleId + "):");
        Janus.debug(request);
        if(websockets) {
            request["session_id"] = sessionId;
            request["handle_id"] = handleId;
            transactions[transaction] = function(json) {
                Janus.debug("Message sent!");
                Janus.debug(json);
                if(json["janus"] === "success") {
                    // We got a success, must have been a synchronous transaction
                    var plugindata = json["plugindata"];
                    if(plugindata === undefined || plugindata === null) {
                        Janus.warn("Request succeeded, but missing plugindata...");
                        callbacks.success();
                        return;
                    }
                    Janus.log("Synchronous transaction successful (" + plugindata["plugin"] + ")");
                    var data = plugindata["data"];
                    Janus.debug(data);
                    callbacks.success(data);
                    return;
                } else if(json["janus"] !== "ack") {
                    // Not a success and not an ack, must be an error
                    if(json["error"] !== undefined && json["error"] !== null) {
                        Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                        callbacks.error(json["error"].code + " " + json["error"].reason);
                    } else {
                        Janus.error("Unknown error");	// FIXME
                        callbacks.error("Unknown error");
                    }
                    return;
                }
                // If we got here, the plugin decided to handle the request asynchronously
                callbacks.success();
            };
            ws.send(JSON.stringify(request));
            return;
        }
        $.ajax({
            type: 'POST',
            url: server + "/" + sessionId + "/" + handleId,
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.debug("Message sent!");
                Janus.debug(json);
                if(json["janus"] === "success") {
                    // We got a success, must have been a synchronous transaction
                    var plugindata = json["plugindata"];
                    if(plugindata === undefined || plugindata === null) {
                        Janus.warn("Request succeeded, but missing plugindata...");
                        callbacks.success();
                        return;
                    }
                    Janus.log("Synchronous transaction successful (" + plugindata["plugin"] + ")");
                    var data = plugindata["data"];
                    Janus.debug(data);
                    callbacks.success(data);
                    return;
                } else if(json["janus"] !== "ack") {
                    // Not a success and not an ack, must be an error
                    if(json["error"] !== undefined && json["error"] !== null) {
                        Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                        callbacks.error(json["error"].code + " " + json["error"].reason);
                    } else {
                        Janus.error("Unknown error");	// FIXME
                        callbacks.error("Unknown error");
                    }
                    return;
                }
                // If we got here, the plugin decided to handle the request asynchronously
                callbacks.success();
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
                callbacks.error(textStatus + ": " + errorThrown);
            },
            dataType: "json"
        });
    }

    // Private method to send a trickle candidate
    function sendTrickleCandidate(handleId, candidate) {
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            return;
        }
        var request = { "janus": "trickle", "candidate": candidate, "transaction": Janus.randomString(12) };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        Janus.vdebug("Sending trickle candidate (handle=" + handleId + "):");
        Janus.vdebug(request);
        if(websockets) {
            request["session_id"] = sessionId;
            request["handle_id"] = handleId;
            ws.send(JSON.stringify(request));
            return;
        }
        $.ajax({
            type: 'POST',
            url: server + "/" + sessionId + "/" + handleId,
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.vdebug("Candidate sent!");
                Janus.vdebug(json);
                if(json["janus"] !== "ack") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                    return;
                }
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
            },
            dataType: "json"
        });
    }

    // Private method to send a data channel message
    function sendData(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        var text = callbacks.text;
        if(text === null || text === undefined) {
            Janus.warn("Invalid text");
            callbacks.error("Invalid text");
            return;
        }
        Janus.log("Sending string on data channel: " + text);
        config.dataChannel.send(text);
        callbacks.success();
    }

    // Private method to send a DTMF tone
    function sendDtmf(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        if(config.dtmfSender === null || config.dtmfSender === undefined) {
            // Create the DTMF sender, if possible
            if(config.myStream !== undefined && config.myStream !== null) {
                var tracks = config.myStream.getAudioTracks();
                if(tracks !== null && tracks !== undefined && tracks.length > 0) {
                    var local_audio_track = tracks[0];
                    config.dtmfSender = config.pc.createDTMFSender(local_audio_track);
                    Janus.log("Created DTMF Sender");
                    config.dtmfSender.ontonechange = function(tone) { Janus.debug("Sent DTMF tone: " + tone.tone); };
                }
            }
            if(config.dtmfSender === null || config.dtmfSender === undefined) {
                Janus.warn("Invalid DTMF configuration");
                callbacks.error("Invalid DTMF configuration");
                return;
            }
        }
        var dtmf = callbacks.dtmf;
        if(dtmf === null || dtmf === undefined) {
            Janus.warn("Invalid DTMF parameters");
            callbacks.error("Invalid DTMF parameters");
            return;
        }
        var tones = dtmf.tones;
        if(tones === null || tones === undefined) {
            Janus.warn("Invalid DTMF string");
            callbacks.error("Invalid DTMF string");
            return;
        }
        var duration = dtmf.duration;
        if(duration === null || duration === undefined)
            duration = 500;	// We choose 500ms as the default duration for a tone
        var gap = dtmf.gap;
        if(gap === null || gap === undefined)
            gap = 50;	// We choose 50ms as the default gap between tones
        Janus.debug("Sending DTMF string " + tones + " (duration " + duration + "ms, gap " + gap + "ms)");
        config.dtmfSender.insertDTMF(tones, duration, gap);
    }

    // Private method to destroy a plugin handle
    function destroyHandle(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        Janus.warn(callbacks);
        var asyncRequest = true;
        if(callbacks.asyncRequest !== undefined && callbacks.asyncRequest !== null)
            asyncRequest = (callbacks.asyncRequest === true);
        Janus.log("Destroying handle " + handleId + " (async=" + asyncRequest + ")");
        cleanupWebrtc(handleId);
        if (pluginHandles[handleId].detached) {
            // Plugin was already detached by Janus, calling detach again will return a handle not found error, so just exit here
            delete pluginHandles[handleId];
            callbacks.success();
            return;
        }
        if(!connected) {
            Janus.warn("Is the gateway down? (connected=false)");
            callbacks.error("Is the gateway down? (connected=false)");
            return;
        }
        var request = { "janus": "detach", "transaction": Janus.randomString(12) };
        if(token !== null && token !== undefined)
            request["token"] = token;
        if(apisecret !== null && apisecret !== undefined)
            request["apisecret"] = apisecret;
        if(websockets) {
            request["session_id"] = sessionId;
            request["handle_id"] = handleId;
            ws.send(JSON.stringify(request));
            delete pluginHandles[handleId];
            callbacks.success();
            return;
        }
        $.ajax({
            type: 'POST',
            url: server + "/" + sessionId + "/" + handleId,
            async: asyncRequest,	// Sometimes we need false here, or destroying in onbeforeunload won't work
            xhrFields: {
                withCredentials: withCredentials
            },
            cache: false,
            contentType: "application/json",
            data: JSON.stringify(request),
            success: function(json) {
                Janus.log("Destroyed handle:");
                Janus.debug(json);
                if(json["janus"] !== "success") {
                    Janus.error("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
                }
                delete pluginHandles[handleId];
                callbacks.success();
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                Janus.error(textStatus + ": " + errorThrown);	// FIXME
                // We cleanup anyway
                delete pluginHandles[handleId];
                callbacks.success();
            },
            dataType: "json"
        });
    }

    // WebRTC stuff
    function streamsDone(handleId, jsep, media, callbacks, stream) {
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        Janus.debug("streamsDone:", stream);
        config.myStream = stream;
        var pc_config = {"iceServers": iceServers, "iceTransportPolicy": iceTransportPolicy, "bundlePolicy": bundlePolicy};
        //~ var pc_constraints = {'mandatory': {'MozDontOfferDataChannel':true}};
        var pc_constraints = {
            "optional": [{"DtlsSrtpKeyAgreement": true}]
        };
        if(ipv6Support === true) {
            // FIXME This is only supported in Chrome right now
            // For support in Firefox track this: https://bugzilla.mozilla.org/show_bug.cgi?id=797262
            pc_constraints.optional.push({"googIPv6":true});
        }
        if(adapter.browserDetails.browser === "edge") {
            // This is Edge, enable BUNDLE explicitly
            pc_config.bundlePolicy = "max-bundle";
        }
        Janus.log("Creating PeerConnection");
        Janus.debug(pc_constraints);
        config.pc = new RTCPeerConnection(pc_config, pc_constraints);
        Janus.debug(config.pc);
        if(config.pc.getStats) {	// FIXME
            config.volume.value = 0;
            config.bitrate.value = "0 kbits/sec";
        }
        Janus.log("Preparing local SDP and gathering candidates (trickle=" + config.trickle + ")");
        config.pc.oniceconnectionstatechange = function(e) {
            if(config.pc)
                pluginHandle.iceState(config.pc.iceConnectionState);
        };
        config.pc.onicecandidate = function(event) {
            if (event.candidate == null ||
                (adapter.browserDetails.browser === 'edge' && event.candidate.candidate.indexOf('endOfCandidates') > 0)) {
                Janus.log("End of candidates.");
                config.iceDone = true;
                if(config.trickle === true) {
                    // Notify end of candidates
                    sendTrickleCandidate(handleId, {"completed": true});
                } else {
                    // No trickle, time to send the complete SDP (including all candidates)
                    sendSDP(handleId, callbacks);
                }
            } else {
                // JSON.stringify doesn't work on some WebRTC objects anymore
                // See https://code.google.com/p/chromium/issues/detail?id=467366
                var candidate = {
                    "candidate": event.candidate.candidate,
                    "sdpMid": event.candidate.sdpMid,
                    "sdpMLineIndex": event.candidate.sdpMLineIndex
                };
                if(config.trickle === true) {
                    // Send candidate
                    sendTrickleCandidate(handleId, candidate);
                }
            }
        };
        if(stream !== null && stream !== undefined) {
            Janus.log('Adding local stream');
            config.pc.addStream(stream);
            pluginHandle.onlocalstream(stream);
        }
        config.pc.onaddstream = function(remoteStream) {
            Janus.log("Handling Remote Stream");
            Janus.debug(remoteStream);
            config.remoteStream = remoteStream;
            pluginHandle.onremotestream(remoteStream.stream);
        };
        // Any data channel to create?
        if(isDataEnabled(media)) {
            Janus.log("Creating data channel");
            var onDataChannelMessage = function(event) {
                Janus.log('Received message on data channel: ' + event.data);
                pluginHandle.ondata(event.data);	// FIXME
            }
            var onDataChannelStateChange = function() {
                var dcState = config.dataChannel !== null ? config.dataChannel.readyState : "null";
                Janus.log('State change on data channel: ' + dcState);
                if(dcState === 'open') {
                    pluginHandle.ondataopen();	// FIXME
                }
            }
            var onDataChannelError = function(error) {
                Janus.error('Got error on data channel:', error);
                // TODO
            }
            // Until we implement the proxying of open requests within the Janus core, we open a channel ourselves whatever the case
            config.dataChannel = config.pc.createDataChannel("JanusDataChannel", {ordered:false});	// FIXME Add options (ordered, maxRetransmits, etc.)
            config.dataChannel.onmessage = onDataChannelMessage;
            config.dataChannel.onopen = onDataChannelStateChange;
            config.dataChannel.onclose = onDataChannelStateChange;
            config.dataChannel.onerror = onDataChannelError;
        }
        // Create offer/answer now
        if(jsep === null || jsep === undefined) {
            createOffer(handleId, media, callbacks);
        } else {
            if(adapter.browserDetails.browser === "edge") {
                // This is Edge, add an a=end-of-candidates at the end
                jsep.sdp += "a=end-of-candidates\r\n";
            }
            config.pc.setRemoteDescription(
                new RTCSessionDescription(jsep),
                function() {
                    Janus.log("Remote description accepted!");
                    createAnswer(handleId, media, callbacks);
                }, callbacks.error);
        }
    }

    function prepareWebrtc(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : webrtcError;
        var jsep = callbacks.jsep;
        var media = callbacks.media;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        // Are we updating a session?
        if(config.pc !== undefined && config.pc !== null) {
            Janus.log("Updating existing media session");
            // Create offer/answer now
            if(jsep === null || jsep === undefined) {
                createOffer(handleId, media, callbacks);
            } else {
                if(adapter.browserDetails.browser === "edge") {
                    // This is Edge, add an a=end-of-candidates at the end
                    jsep.sdp += "a=end-of-candidates\r\n";
                }
                config.pc.setRemoteDescription(
                    new RTCSessionDescription(jsep),
                    function() {
                        Janus.log("Remote description accepted!");
                        createAnswer(handleId, media, callbacks);
                    }, callbacks.error);
            }
            return;
        }
        // Was a MediaStream object passed, or do we need to take care of that?
        if(callbacks.stream !== null && callbacks.stream !== undefined) {
            var stream = callbacks.stream;
            Janus.log("MediaStream provided by the application");
            Janus.debug(stream);
            // Skip the getUserMedia part
            config.streamExternal = true;
            streamsDone(handleId, jsep, media, callbacks, stream);
            return;
        }
        config.trickle = isTrickleEnabled(callbacks.trickle);
        if(isAudioSendEnabled(media) || isVideoSendEnabled(media)) {
            var constraints = { mandatory: {}, optional: []};
            pluginHandle.consentDialog(true);
            var audioSupport = isAudioSendEnabled(media);
            if(audioSupport === true && media != undefined && media != null) {
                if(typeof media.audio === 'object') {
                    audioSupport = media.audio;
                }
            }
            var videoSupport = isVideoSendEnabled(media);
            if(videoSupport === true && media != undefined && media != null) {
                if(media.video && media.video != 'screen' && media.video != 'window') {
                    var width = 0;
                    var height = 0, maxHeight = 0;
                    if(media.video === 'lowres') {
                        // Small resolution, 4:3
                        height = 240;
                        maxHeight = 240;
                        width = 320;
                    } else if(media.video === 'lowres-16:9') {
                        // Small resolution, 16:9
                        height = 180;
                        maxHeight = 180;
                        width = 320;
                    } else if(media.video === 'hires' || media.video === 'hires-16:9' ) {
                        // High resolution is only 16:9
                        height = 720;
                        maxHeight = 720;
                        width = 1280;
                        if(navigator.mozGetUserMedia) {
                            var firefoxVer = parseInt(window.navigator.userAgent.match(/Firefox\/(.*)/)[1], 10);
                            if(firefoxVer < 38) {
                                // Unless this is and old Firefox, which doesn't support it
                                Janus.warn(media.video + " unsupported, falling back to stdres (old Firefox)");
                                height = 480;
                                maxHeight = 480;
                                width  = 640;
                            }
                        }
                    } else if(media.video === 'stdres') {
                        // Normal resolution, 4:3
                        height = 480;
                        maxHeight = 480;
                        width  = 640;
                    } else if(media.video === 'stdres-16:9') {
                        // Normal resolution, 16:9
                        height = 360;
                        maxHeight = 360;
                        width = 640;
                    } else {
                        Janus.log("Default video setting is stdres 4:3");
                        height = 480;
                        maxHeight = 480;
                        width = 640;
                    }
                    Janus.log("Adding media constraint:", media.video);
                    if(navigator.mozGetUserMedia) {
                        var firefoxVer = parseInt(window.navigator.userAgent.match(/Firefox\/(.*)/)[1], 10);
                        if(firefoxVer < 38) {
                            videoSupport = {
                                'require': ['height', 'width'],
                                'height': {'max': maxHeight, 'min': height},
                                'width':  {'max': width,  'min': width}
                            };
                        } else {
                            // http://stackoverflow.com/questions/28282385/webrtc-firefox-constraints/28911694#28911694
                            // https://github.com/meetecho/janus-gateway/pull/246
                            videoSupport = {
                                'height': {'ideal': height},
                                'width':  {'ideal': width}
                            };
                        }
                    } else {
                        videoSupport = {
                            'mandatory': {
                                'maxHeight': maxHeight,
                                'minHeight': height,
                                'maxWidth':  width,
                                'minWidth':  width
                            },
                            'optional': []
                        };
                    }
                    if(typeof media.video === 'object') {
                        videoSupport = media.video;
                    }
                    Janus.debug(videoSupport);
                } else if(media.video === 'screen' || media.video === 'window') {
                    if(!media.screenshareFrameRate) {
                        media.screenshareFrameRate = 3;
                    }
                    // Not a webcam, but screen capture
                    if(window.location.protocol !== 'https:') {
                        // Screen sharing mandates HTTPS
                        Janus.warn("Screen sharing only works on HTTPS, try the https:// version of this page");
                        pluginHandle.consentDialog(false);
                        callbacks.error("Screen sharing only works on HTTPS, try the https:// version of this page");
                        return;
                    }
                    // We're going to try and use the extension for Chrome 34+, the old approach
                    // for older versions of Chrome, or the experimental support in Firefox 33+
                    var cache = {};
                    function callbackUserMedia (error, stream) {
                        pluginHandle.consentDialog(false);
                        if(error) {
                            callbacks.error({code: error.code, name: error.name, message: error.message});
                        } else {
                            streamsDone(handleId, jsep, media, callbacks, stream );
                        }
                    };
                    function getScreenMedia(constraints, gsmCallback, useAudio) {
                        Janus.log("Adding media constraint (screen capture)");
                        Janus.debug(constraints);
                        navigator.mediaDevices.getUserMedia(constraints)
                            .then(function(stream) {
                                if(useAudio){
                                    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                                        .then(function (audioStream) {
                                            stream.addTrack(audioStream.getAudioTracks()[0]);
                                            gsmCallback(null, stream);
                                        })
                                } else {
                                    gsmCallback(null, stream);
                                }
                            })
                            .catch(function(error) { pluginHandle.consentDialog(false); gsmCallback(error); });
                    };
                    if(adapter.browserDetails.browser === 'chrome') {
                        var chromever = adapter.browserDetails.version;
                        var maxver = 33;
                        if(window.navigator.userAgent.match('Linux'))
                            maxver = 35;	// "known" crash in chrome 34 and 35 on linux
                        if(chromever >= 26 && chromever <= maxver) {
                            // Chrome 26->33 requires some awkward chrome://flags manipulation
                            constraints = {
                                video: {
                                    mandatory: {
                                        googLeakyBucket: true,
                                        maxWidth: window.screen.width,
                                        maxHeight: window.screen.height,
                                        minFrameRate: media.screenshareFrameRate,
                                        maxFrameRate: media.screenshareFrameRate,
                                        chromeMediaSource: 'screen'
                                    }
                                },
                                audio: isAudioSendEnabled(media)
                            };
                            getScreenMedia(constraints, callbackUserMedia);
                        } else {
                            // Chrome 34+ requires an extension
                            var pending = window.setTimeout(
                                function () {
                                    error = new Error('NavigatorUserMediaError');
                                    error.name = 'The required Chrome extension is not installed: click <a href="#">here</a> to install it. (NOTE: this will need you to refresh the page)';
                                    pluginHandle.consentDialog(false);
                                    return callbacks.error(error);
                                }, 1000);
                            cache[pending] = [callbackUserMedia, null];
                            window.postMessage({ type: 'janusGetScreen', id: pending }, '*');
                        }
                    } else if (window.navigator.userAgent.match('Firefox')) {
                        var ffver = parseInt(window.navigator.userAgent.match(/Firefox\/(.*)/)[1], 10);
                        if(ffver >= 33) {
                            // Firefox 33+ has experimental support for screen sharing
                            constraints = {
                                video: {
                                    mozMediaSource: media.video,
                                    mediaSource: media.video
                                },
                                audio: isAudioSendEnabled(media)
                            };
                            getScreenMedia(constraints, function (err, stream) {
                                callbackUserMedia(err, stream);
                                // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1045810
                                if (!err) {
                                    var lastTime = stream.currentTime;
                                    var polly = window.setInterval(function () {
                                        if(!stream)
                                            window.clearInterval(polly);
                                        if(stream.currentTime == lastTime) {
                                            window.clearInterval(polly);
                                            if(stream.onended) {
                                                stream.onended();
                                            }
                                        }
                                        lastTime = stream.currentTime;
                                    }, 500);
                                }
                            });
                        } else {
                            var error = new Error('NavigatorUserMediaError');
                            error.name = 'Your version of Firefox does not support screen sharing, please install Firefox 33 (or more recent versions)';
                            pluginHandle.consentDialog(false);
                            callbacks.error(error);
                            return;
                        }
                    }

                    // Wait for events from the Chrome Extension
                    window.addEventListener('message', function (event) {
                        if(event.origin != window.location.origin)
                            return;
                        if(event.data.type == 'janusGotScreen' && cache[event.data.id]) {
                            var data = cache[event.data.id];
                            var callback = data[0];
                            delete cache[event.data.id];

                            if (event.data.sourceId === '') {
                                // user canceled
                                var error = new Error('NavigatorUserMediaError');
                                error.name = 'You cancelled the request for permission, giving up...';
                                pluginHandle.consentDialog(false);
                                callbacks.error(error);
                            } else {
                                constraints = {
                                    audio: false,
                                    video: {
                                        mandatory: {
                                            chromeMediaSource: 'desktop',
                                            maxWidth: window.screen.width,
                                            maxHeight: window.screen.height,
                                            minFrameRate: media.screenshareFrameRate,
                                            maxFrameRate: media.screenshareFrameRate,
                                        },
                                        optional: [
                                            {googLeakyBucket: true},
                                            {googTemporalLayeredScreencast: true}
                                        ]
                                    }
                                };
                                constraints.video.mandatory.chromeMediaSourceId = event.data.sourceId;
                                getScreenMedia(constraints, callback, isAudioSendEnabled(media));
                            }
                        } else if (event.data.type == 'janusGetScreenPending') {
                            window.clearTimeout(event.data.id);
                        }
                    });
                    return;
                }
            }
            // If we got here, we're not screensharing
            if(media === null || media === undefined || media.video !== 'screen') {
                // Check whether all media sources are actually available or not
                navigator.mediaDevices.enumerateDevices().then(function(devices) {
                        var audioExist = devices.some(function(device) {
                                return device.kind === 'audioinput';
                            }),
                            videoExist = devices.some(function(device) {
                                return device.kind === 'videoinput';
                            });

                        // Check whether a missing device is really a problem
                        var audioSend = isAudioSendEnabled(media);
                        var videoSend = isVideoSendEnabled(media);
                        var needAudioDevice = isAudioSendRequired(media);
                        var needVideoDevice = isVideoSendRequired(media);
                        if(audioSend || videoSend || needAudioDevice || needVideoDevice) {
                            // We need to send either audio or video
                            var haveAudioDevice = audioSend ? audioExist : false;
                            var haveVideoDevice = videoSend ? videoExist : false;
                            if(!haveAudioDevice && !haveVideoDevice) {
                                // FIXME Should we really give up, or just assume recvonly for both?
                                pluginHandle.consentDialog(false);
                                callbacks.error('No capture device found');
                                return false;
                            } else if(!haveAudioDevice && needAudioDevice) {
                                pluginHandle.consentDialog(false);
                                callbacks.error('Audio capture is required, but no capture device found');
                                return false;
                            } else if(!haveVideoDevice && needVideoDevice) {
                                pluginHandle.consentDialog(false);
                                callbacks.error('Video capture is required, but no capture device found');
                                return false;
                            }
                        }

                        navigator.mediaDevices.getUserMedia({
                                audio: audioExist ? audioSupport : false,
                                video: videoExist ? videoSupport : false
                            })
                            .then(function(stream) { pluginHandle.consentDialog(false); streamsDone(handleId, jsep, media, callbacks, stream); })
                            .catch(function(error) { pluginHandle.consentDialog(false); callbacks.error({code: error.code, name: error.name, message: error.message}); });
                    })
                    .catch(function(error) {
                        pluginHandle.consentDialog(false);
                        callbacks.error('enumerateDevices error', error);
                    });
            }
        } else {
            // No need to do a getUserMedia, create offer/answer right away
            streamsDone(handleId, jsep, media, callbacks);
        }
    }

    function prepareWebrtcPeer(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : webrtcError;
        var jsep = callbacks.jsep;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        if(jsep !== undefined && jsep !== null) {
            if(config.pc === null) {
                Janus.warn("Wait, no PeerConnection?? if this is an answer, use createAnswer and not handleRemoteJsep");
                callbacks.error("No PeerConnection: if this is an answer, use createAnswer and not handleRemoteJsep");
                return;
            }
            if(adapter.browserDetails.browser === "edge") {
                // This is Edge, add an a=end-of-candidates at the end
                jsep.sdp += "a=end-of-candidates\r\n";
            }
            config.pc.setRemoteDescription(
                new RTCSessionDescription(jsep),
                function() {
                    Janus.log("Remote description accepted!");
                    callbacks.success();
                }, callbacks.error);
        } else {
            callbacks.error("Invalid JSEP");
        }
    }

    function createOffer(handleId, media, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        Janus.log("Creating offer (iceDone=" + config.iceDone + ")");
        // https://code.google.com/p/webrtc/issues/detail?id=3508
        var mediaConstraints = null;
        if(adapter.browserDetails.browser == "firefox" || adapter.browserDetails.browser == "edge") {
            mediaConstraints = {
                'offerToReceiveAudio':isAudioRecvEnabled(media),
                'offerToReceiveVideo':isVideoRecvEnabled(media)
            };
        } else {
            mediaConstraints = {
                'mandatory': {
                    'OfferToReceiveAudio':isAudioRecvEnabled(media),
                    'OfferToReceiveVideo':isVideoRecvEnabled(media)
                }
            };
        }
        Janus.debug(mediaConstraints);
        config.pc.createOffer(
            function(offer) {
                Janus.debug(offer);
                if(config.mySdp === null || config.mySdp === undefined) {
                    Janus.log("Setting local description");
                    var audioSsrcList = SDPUtils.parseSsrc(offer.sdp,"audio");
                    var videoSsrcList = SDPUtils.parseSsrc(offer.sdp,"video");

                    if(audioSsrcList.length>0)
                    {
                        var reg=new RegExp(audioSsrcList[0].ssrc,"g");
                        offer.sdp = offer.sdp.replace(reg,callbacks.assrc);
                    }
                    if(videoSsrcList.length>0)
                    {
                        var reg=new RegExp(videoSsrcList[0].ssrc,"g");
                        offer.sdp = offer.sdp.replace(reg,callbacks.vssrc);
                    }
                    offer.sdp = offer.sdp.replace(/a=mid:video\r\n/g , 'a=mid:video\r\nb=AS:500\r\n');


                    Janus.log("offer.sdp = ", offer.sdp);
                    config.pc.setLocalDescription(offer);
                }
                if(!config.iceDone && !config.trickle) {
                    // Don't do anything until we have all candidates
                    Janus.log("Waiting for all candidates...");
                    return;
                }
                if(config.sdpSent) {
                    Janus.log("Offer already sent, not sending it again");
                    return;
                }
                Janus.log("Offer ready");
                Janus.debug(callbacks);
                config.sdpSent = true;
                // JSON.stringify doesn't work on some WebRTC objects anymore
                // See https://code.google.com/p/chromium/issues/detail?id=467366
                var jsep = {
                    "type": offer.type,
                    "sdp": offer.sdp
                };
                callbacks.success(jsep);
            }, callbacks.error, mediaConstraints);
    }

    function createAnswer(handleId, media, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            callbacks.error("Invalid handle");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        Janus.log("Creating answer (iceDone=" + config.iceDone + ")");
        var mediaConstraints = null;
        if(adapter.browserDetails.browser == "firefox" || adapter.browserDetails.browser == "edge") {
            mediaConstraints = {
                'offerToReceiveAudio':isAudioRecvEnabled(media),
                'offerToReceiveVideo':isVideoRecvEnabled(media)
            };
        } else {
            mediaConstraints = {
                'mandatory': {
                    'OfferToReceiveAudio':isAudioRecvEnabled(media),
                    'OfferToReceiveVideo':isVideoRecvEnabled(media)
                }
            };
        }
        Janus.debug(mediaConstraints);
        config.pc.createAnswer(
            function(answer) {
                Janus.debug(answer);
                if(config.mySdp === null || config.mySdp === undefined) {
                    Janus.log("Setting local description");
                    var audioSsrcList = SDPUtils.parseSsrc(answer.sdp,"audio");
                    var videoSsrcList = SDPUtils.parseSsrc(answer.sdp,"video");
                    if(audioSsrcList.length>0)
                    {
                        if(audioSsrcList[0] != undefined){
                            var reg = new RegExp(audioSsrcList[0].ssrc,"g");
                            answer.sdp = answer.sdp.replace(reg,callbacks.assrc);
                        }
                    }
                    if(videoSsrcList.length>0)
                    {
                        var reg = new RegExp(videoSsrcList[0].ssrc,"g");
                        answer.sdp = answer.sdp.replace(reg,callbacks.vssrc);
                    }
                    answer.sdp = answer.sdp.replace(/a=mid:video\r\n/g , 'a=mid:video\r\nb=AS:500\r\n');
                    //answer.sdp = answer.sdp.replace(/m=audio 9 RTP\/SAVPF 120\r\n/g , 'm=audio 9 RTP/SAVPF 120 127\r\n');
                    //answer.sdp = answer.sdp.replace(/a=rtpmap:120 opus\/48000\/2\r\n/g , 'a=rtpmap:120 opus/48000/2\r\na=rtpmap:127 red/8000\r\n');
                    Janus.log("answer.sdp = ", answer.sdp);
                    config.mySdp = answer.sdp;
                    config.pc.setLocalDescription(answer);
                }
                if(!config.iceDone && !config.trickle) {
                    // Don't do anything until we have all candidates
                    Janus.log("Waiting for all candidates...");
                    return;
                }
                if(config.sdpSent) {	// FIXME badly
                    Janus.log("Answer already sent, not sending it again");
                    return;
                }
                config.sdpSent = true;
                // JSON.stringify doesn't work on some WebRTC objects anymore
                // See https://code.google.com/p/chromium/issues/detail?id=467366
                var jsep = {
                    "type": answer.type,
                    "sdp": answer.sdp
                };
                callbacks.success(jsep);
            }, callbacks.error, mediaConstraints);
    }

    function sendSDP(handleId, callbacks) {
        callbacks = callbacks || {};
        callbacks.success = (typeof callbacks.success == "function") ? callbacks.success : jQuery.noop;
        callbacks.error = (typeof callbacks.error == "function") ? callbacks.error : jQuery.noop;
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle, not sending anything");
            return;
        }
        var config = pluginHandle.webrtcStuff;
        Janus.log("Sending offer/answer SDP...");
        if(config.mySdp === null || config.mySdp === undefined) {
            Janus.warn("Local SDP instance is invalid, not sending anything...");
            return;
        }
        config.mySdp = {
            "type": config.pc.localDescription.type,
            "sdp": config.pc.localDescription.sdp
        };
        if(config.sdpSent) {
            Janus.log("Offer/Answer SDP already sent, not sending it again");
            return;
        }
        if(config.trickle === false)
            config.mySdp["trickle"] = false;
        Janus.debug(callbacks);
        config.sdpSent = true;
        callbacks.success(config.mySdp);
    }

    function getVolume(handleId) {
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            return 0;
        }
        var config = pluginHandle.webrtcStuff;
        // Start getting the volume, if getStats is supported
        if(config.pc.getStats && adapter.browserDetails.browser == "chrome") {	// FIXME
            if(config.remoteStream === null || config.remoteStream === undefined) {
                Janus.warn("Remote stream unavailable");
                return 0;
            }
            // http://webrtc.googlecode.com/svn/trunk/samples/js/demos/html/constraints-and-stats.html
            if(config.volume.timer === null || config.volume.timer === undefined) {
                Janus.log("Starting volume monitor");
                config.volume.timer = setInterval(function() {
                    config.pc.getStats(function(stats) {
                        var results = stats.result();
                        for(var i=0; i<results.length; i++) {
                            var res = results[i];
                            if(res.type == 'ssrc' && res.stat('audioOutputLevel')) {
                                config.volume.value = res.stat('audioOutputLevel');
                            }
                        }
                    });
                }, 200);
                return 0;	// We don't have a volume to return yet
            }
            return config.volume.value;
        } else {
            Janus.log("Getting the remote volume unsupported by browser");
            return 0;
        }
    }

    function isMuted(handleId, video) {
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            return true;
        }
        var config = pluginHandle.webrtcStuff;
        if(config.pc === null || config.pc === undefined) {
            Janus.warn("Invalid PeerConnection");
            return true;
        }
        if(config.myStream === undefined || config.myStream === null) {
            Janus.warn("Invalid local MediaStream");
            return true;
        }
        if(video) {
            // Check video track
            if(config.myStream.getVideoTracks() === null
                || config.myStream.getVideoTracks() === undefined
                || config.myStream.getVideoTracks().length === 0) {
                Janus.warn("No video track");
                return true;
            }
            return !config.myStream.getVideoTracks()[0].enabled;
        } else {
            // Check audio track
            if(config.myStream.getAudioTracks() === null
                || config.myStream.getAudioTracks() === undefined
                || config.myStream.getAudioTracks().length === 0) {
                Janus.warn("No audio track");
                return true;
            }
            return !config.myStream.getAudioTracks()[0].enabled;
        }
    }

    function mute(handleId, video, mute) {
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            return false;
        }
        var config = pluginHandle.webrtcStuff;
        if(config.pc === null || config.pc === undefined) {
            Janus.warn("Invalid PeerConnection");
            return false;
        }
        if(config.myStream === undefined || config.myStream === null) {
            Janus.warn("Invalid local MediaStream");
            return false;
        }
        if(video) {
            // Mute/unmute video track
            if(config.myStream.getVideoTracks() === null
                || config.myStream.getVideoTracks() === undefined
                || config.myStream.getVideoTracks().length === 0) {
                Janus.warn("No video track");
                return false;
            }
            config.myStream.getVideoTracks()[0].enabled = mute ? false : true;
            return true;
        } else {
            // Mute/unmute audio track
            if(config.myStream.getAudioTracks() === null
                || config.myStream.getAudioTracks() === undefined
                || config.myStream.getAudioTracks().length === 0) {
                Janus.warn("No audio track");
                return false;
            }
            config.myStream.getAudioTracks()[0].enabled = mute ? false : true;
            return true;
        }
    }

    function getBitrate(handleId) {
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined ||
            pluginHandle.webrtcStuff === null || pluginHandle.webrtcStuff === undefined) {
            Janus.warn("Invalid handle");
            return "Invalid handle";
        }
        var config = pluginHandle.webrtcStuff;
        if(config.pc === null || config.pc === undefined)
            return "Invalid PeerConnection";
        // Start getting the bitrate, if getStats is supported
        if(config.pc.getStats) {
            if(config.bitrate.timer === null || config.bitrate.timer === undefined) {
                Janus.log("Starting bitrate timer (via getStats)");
                config.bitrate.timer = setInterval(function() {
                    config.pc.getStats()
                        .then(function(stats) {
                            stats.forEach(function (res) {
                                if(res && (res.mediaType === "video" || res.id.toLowerCase().indexOf("video") > -1) &&
                                    res.type === "inbound-rtp" && res.id.indexOf("rtcp") < 0) {
                                    config.bitrate.bsnow = res.bytesReceived;
                                    config.bitrate.tsnow = res.timestamp;
                                    if(config.bitrate.bsbefore === null || config.bitrate.tsbefore === null) {
                                        // Skip this round
                                        config.bitrate.bsbefore = config.bitrate.bsnow;
                                        config.bitrate.tsbefore = config.bitrate.tsnow;
                                    } else {
                                        // Calculate bitrate
                                        var timePassed = config.bitrate.tsnow - config.bitrate.tsbefore;
                                        if(adapter.browserDetails.browser == "safari")
                                            timePassed = timePassed/1000;	// Apparently the timestamp is in microseconds, in Safari
                                        var bitRate = Math.round((config.bitrate.bsnow - config.bitrate.bsbefore) * 8 / timePassed);
                                        config.bitrate.value = bitRate + ' kbits/sec';
                                        //~ Janus.log("Estimated bitrate is " + config.bitrate.value);
                                        config.bitrate.bsbefore = config.bitrate.bsnow;
                                        config.bitrate.tsbefore = config.bitrate.tsnow;
                                    }
                                }
                            });
                        });
                }, 1000);
                return "0 kbits/sec";	// We don't have a bitrate value yet
            }
            return config.bitrate.value;
        } else {
            Janus.warn("Getting the video bitrate unsupported by browser");
            return "Feature unsupported by browser";
        }
    }

    function webrtcError(error) {
        Janus.error("WebRTC error:", error);
    }

    function cleanupWebrtc(handleId, hangupRequest) {
        Janus.log("Cleaning WebRTC stuff");
        var pluginHandle = pluginHandles[handleId];
        if(pluginHandle === null || pluginHandle === undefined) {
            // Nothing to clean
            return;
        }
        var config = pluginHandle.webrtcStuff;
        if(config !== null && config !== undefined) {
            if(hangupRequest === true) {
                // Send a hangup request (we don't really care about the response)
                var request = { "janus": "hangup", "transaction": Janus.randomString(12) };
                if(token !== null && token !== undefined)
                    request["token"] = token;
                if(apisecret !== null && apisecret !== undefined)
                    request["apisecret"] = apisecret;
                Janus.debug("Sending hangup request (handle=" + handleId + "):");
                Janus.debug(request);
                if(websockets) {
                    request["session_id"] = sessionId;
                    request["handle_id"] = handleId;
                    ws.send(JSON.stringify(request));
                } else {
                    $.ajax({
                        type: 'POST',
                        url: server + "/" + sessionId + "/" + handleId,
                        xhrFields: {
                            withCredentials: withCredentials
                        },
                        cache: false,
                        contentType: "application/json",
                        data: JSON.stringify(request),
                        dataType: "json"
                    });
                }
            }
            // Cleanup stack
            config.remoteStream = null;
            if(config.volume.timer)
                clearInterval(config.volume.timer);
            config.volume.value = null;
            if(config.bitrate.timer)
                clearInterval(config.bitrate.timer);
            config.bitrate.timer = null;
            config.bitrate.bsnow = null;
            config.bitrate.bsbefore = null;
            config.bitrate.tsnow = null;
            config.bitrate.tsbefore = null;
            config.bitrate.value = null;
            try {
                // Try a MediaStream.stop() first
                if(!config.streamExternal && config.myStream !== null && config.myStream !== undefined) {
                    Janus.log("Stopping local stream");
                    config.myStream.stop();
                }
            } catch(e) {
                // Do nothing if this fails
            }
            try {
                // Try a MediaStreamTrack.stop() for each track as well
                if(!config.streamExternal && config.myStream !== null && config.myStream !== undefined) {
                    Janus.log("Stopping local stream tracks");
                    var tracks = config.myStream.getTracks();
                    for(var i in tracks) {
                        var mst = tracks[i];
                        Janus.log(mst);
                        if(mst !== null && mst !== undefined)
                            mst.stop();
                    }
                }
            } catch(e) {
                // Do nothing if this fails
            }
            config.streamExternal = false;
            config.myStream = null;
            // Close PeerConnection
            try {
                config.pc.close();
            } catch(e) {
                // Do nothing
            }
            config.pc = null;
            config.mySdp = null;
            config.iceDone = false;
            config.sdpSent = false;
            config.dataChannel = null;
            config.dtmfSender = null;
        }
        pluginHandle.oncleanup();
    }

    // Helper methods to parse a media object
    function isAudioSendEnabled(media) {
        Janus.debug("isAudioSendEnabled:", media);
        if(media === undefined || media === null)
            return true;	// Default
        if(media.audio === false)
            return false;	// Generic audio has precedence
        if(media.audioSend === undefined || media.audioSend === null)
            return true;	// Default
        return (media.audioSend === true);
    }

    function isAudioSendRequired(media) {
        Janus.debug("isAudioSendRequired:", media);
        if(media === undefined || media === null)
            return false;	// Default
        if(media.audio === false || media.audioSend === false)
            return false;	// If we're not asking to capture audio, it's not required
        if(media.failIfNoAudio === undefined || media.failIfNoAudio === null)
            return false;	// Default
        return (media.failIfNoAudio === true);
    }

    function isAudioRecvEnabled(media) {
        Janus.debug("isAudioRecvEnabled:", media);
        if(media === undefined || media === null)
            return true;	// Default
        if(media.audio === false)
            return false;	// Generic audio has precedence
        if(media.audioRecv === undefined || media.audioRecv === null)
            return true;	// Default
        return (media.audioRecv === true);
    }

    function isVideoSendEnabled(media) {
        Janus.debug("isVideoSendEnabled:", media);
        if(media === undefined || media === null)
            return true;	// Default
        if(media.video === false)
            return false;	// Generic video has precedence
        if(media.videoSend === undefined || media.videoSend === null)
            return true;	// Default
        return (media.videoSend === true);
    }

    function isVideoSendRequired(media) {
        Janus.debug("isVideoSendRequired:", media);
        if(media === undefined || media === null)
            return false;	// Default
        if(media.video === false || media.videoSend === false)
            return false;	// If we're not asking to capture video, it's not required
        if(media.failIfNoVideo === undefined || media.failIfNoVideo === null)
            return false;	// Default
        return (media.failIfNoVideo === true);
    }

    function isVideoRecvEnabled(media) {
        Janus.debug("isVideoRecvEnabled:", media);
        if(media === undefined || media === null)
            return true;	// Default
        if(media.video === false)
            return false;	// Generic video has precedence
        if(media.videoRecv === undefined || media.videoRecv === null)
            return true;	// Default
        return (media.videoRecv === true);
    }

    function isDataEnabled(media) {
        Janus.debug("isDataEnabled:", media);
        if(adapter.browserDetails.browser == "edge") {
            Janus.warn("Edge doesn't support data channels yet");
            return false;
        }
        if(media === undefined || media === null)
            return false;	// Default
        return (media.data === true);
    }

    function isTrickleEnabled(trickle) {
        Janus.debug("isTrickleEnabled:", trickle);
        if(trickle === undefined || trickle === null)
            return true;	// Default is true
        return (trickle === true);
    }
};

export default Janus;