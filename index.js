"use strict";

/* based on https://github.com/andrewrk/mpd.js */

/* Public methods:

		init
		destroy
		sendCommand
		sendCommandList
*/

/* Public events:

		destroyed

		ready
		ready-core
		ready-idle

		reconnecting
		reconnecting-core
		reconnecting-idle

		reconnected
		reconnected-core
		reconnected-idle

		disconnected
		disconnected-core
		disconnected-idle

		connected-core
		connected-idle

		changed
*/

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var net = require('net');

var DEBUG = false;

module.exports = MpdClient;

util.inherits(MpdClient, EventEmitter);

function MpdClient(params) {
	// example params:
	//	{ connectOptions: { host: 'localhost'port: 6600 },
	//	  reconnectOptions: { isUse: true, reconnectDelay: 1000 } }

	this._paramConnectOptions = params.connectOptions;
	this._paramReconnectOptions = params.reconnectOptions;

	this._valueIsInit = false;

	this._valueCore = {
		client: null,
		callbackQueue: [],
		dateBuffer: "",
		isReady: false,
		name: 'core'
	};

	this._valueIdle = {
		client: null,
		callbackQueue: [],
		dateBuffer: "",
		isReady: false,
		name: 'idle'
	};
}

MpdClient.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcClientInit(this._valueCore);
		this._funcClientInit(this._valueIdle);

		this.on('ready-idle', this._funcIdleInit.bind(this));
		this.on('reconnected-idle', this._funcIdleInit.bind(this));

		// a connection will be interrupted if no messages send in 4 minutes
		this.on('ready-core', this._funcNoIdleInit.bind(this));

		this._valueIsInit = true;
	}

	return this;
};

MpdClient.prototype.destroy = function() {
	if (this._valueIsInit) {
		this._valueCore.client.removeAllListeners();
		this._valueIdle.client.removeAllListeners();

		if (!this._valueCore.client.destroyed) {
			this._valueCore.client.destroy();
			this.emit('disconnected-core');
			this.emit('disconnected');
		}

		if (!this._valueIdle.client.destroyed) {
			this._valueIdle.client.destroy();
			this.emit('disconnected-idle');
		}


		this._funcCloseAllRequests(this._valueCore.client, 'core');
		this._funcCloseAllRequests(this._valueIdle.client, 'idle');

		this._valueCore.dataBuffer = "";
		this._valueIdle.dataBufer = "";

		this._valueCore.isReady = false;
		this._valueIdle.isReady = false;

		this._valueIsInit = false;

		this.emit('destroyed');
	}

	return this;
};


MpdClient.prototype.sendCommand = function(rawCommand, callback) {
	// this method sends the command and push the callback into
	// the callbacks queue as a MPD server processes commands one by one

	if (!callback) {
		callback = createDummyCallback(rawCommand).bind(this);
	}

	this._sendCommandWithCallback(
		this._valueCore.client,
		this._valueCore.callbackQueue,
		rawCommand,
		callback);

	return this;
};

MpdClient.prototype.sendCommandList = function(rawCommandList, callback) {
	if (!callback) callback = createDummyCallback(rawCommandList).bind(this);

	var commandList = rawCommandList.map(function(rawCommand) {
		return new Command(rawCommand);
	});

	var fullCmd = "command_list_begin\n" + commandList.join('') + "command_list_end";
	this.sendCommand(fullCmd, callback);

	return this;
};

MpdClient.prototype._sendCommandWithCallback = function(client, queue, rawCommand, callback) {
	queue.push(callback);
	this._funcClientSendData(client, new Command(rawCommand));
};

MpdClient.prototype._sendCommandWithoutCallback = function(client, rawCommand) {
	this._funcClientSendData(client, new Command(rawCommand));
};

MpdClient.prototype._funcClientSendData = function(client, data) {
	if (!client.destroyed) {
		client.write(data.toString());
	}
};

function createDummyCallback(command) {
	return function(err) {
		if (err) this.emit('warn', {
			desc: 'the server responded with an error to the command that did not register a callback!',
			command: command,
			error: err
		});
	};
}

function Command(rawCommand) {
	if (typeof rawCommand == 'string') {
		this.cmd = rawCommand;
		this.args = [];
	} else if (!rawCommand.hasOwnProperty('args')) {
		this.cmd = rawCommand.cmd;
		this.args = [];
	} else if (!util.isArray(rawCommand.args)) {
		this.cmd = rawCommand.cmd;
		this.args = [rawCommand.args];
	} else {
		this.cmd = rawCommand.cmd;
		this.args = rawCommand.args;
	}
}

Command.prototype.toString = function() {
	return this.cmd + " " + this.args.map(function(arg) {
		// escapes double quotes
		return (arg !== undefined) ? ('"' + arg.toString().replace(/"/g, '\\"') + '"') : ' ';
	}).join(" ") + "\n";
};

// Core

MpdClient.prototype._funcClientInit = function(clientProps) {
	clientProps.client = net.connect(this._paramConnectOptions)
		.on('connect', function() {
			this.emit('connected-' + clientProps.name);
			if (clientProps.name == 'core') this.emit('connected');
		}.bind(this))
		.on('error', function(error) {
			this.emit('error', {
				desc: 'The connection has been interrupted. ' + clientProps.name,
				error: error
			});
		}.bind(this))
		.on('data', this._funcCreateClientOnDataHandler(clientProps).bind(this))
		.on('close', this._funcCreateClientReconecter(clientProps).bind(this));

	clientProps.client.setEncoding('utf8');
};

MpdClient.prototype._funcCreateClientReconecter = function(clientProps) {
	return function() {
		clientProps.client.removeAllListeners();

		this._funcCloseAllRequests(clientProps.callbackQueue, clientProps.name);

		clientProps.dateBuffer = "";

		if (this._paramReconnectOptions.isUse) {
			this.emit('warn', {
				desc: 'The client attempts to restore the connection. ' + clientProps.name,
				reconnectDelay: this._paramReconnectOptions.reconnectDelay
			});

			this.emit('reconnecting-' + clientProps.name);
			if (clientProps.name == 'core') this.emit('reconnecting');

			setTimeout(function() {
				this._funcClientInit(clientProps);
			}.bind(this), this._paramReconnectOptions.reconnectDelay);
		} else {
			this.emit('error', {
				desc: 'The connection has been interrupted. A reconnect attempt will not be performed.'
			});

			this.emit('disconnected-' + clientProps.name);
			if (clientProps.name == 'core') this.emit('disconnected');
		}
	}
};


MpdClient.prototype._funcCloseAllRequests = function(queue, clientName) {
	while (queue.length) {
		var callback = queue.shift();
		callback({
			desc: "The connection has been closed. " + clientName
		});
	}
};

MpdClient.prototype._funcCreateClientOnDataHandler = function(clientProps) {
	return function(data) {
		clientProps.dateBuffer += data;

		var welcom = clientProps.dateBuffer.match(/(^OK MPD.*?\n)/m);
		var end = clientProps.dateBuffer.match(/(^OK(?:\n|$)|^ACK\s\[.*?\].*(?:\n|$))/m);

		if (DEBUG) {
			console.log('-------' + clientProps.name + '-------');
			console.log('new data part');
			console.log(data);
			console.log('-------' + clientProps.name + '-------');
			console.log();

			console.log('-------' + clientProps.name + '-------');
			console.log('dateBuffer');
			console.log(clientProps.dateBuffer);
			console.log('-------' + clientProps.name + '-------');
			console.log();

			console.log('-------' + clientProps.name + '-------');
			console.log('queue length');
			console.log(clientProps.callbackQueue.length);
			console.log('-------' + clientProps.name + '-------');
			console.log();
		}

		while (welcom || end) {
			if (welcom) {
				if (!clientProps.isReady) {
					clientProps.isReady = true;

					if (this._valueIdle.isReady && this._valueCore.isReady) this.emit('ready');
					this.emit('ready-' + clientProps.name);
				} else {
					this.emit('reconnected-' + clientProps.name);
					if (clientProps.name == 'core') this.emit('reconnected');
				}

				clientProps.dateBuffer = clientProps.dateBuffer.substring(welcom[0].length + welcom.index);
			} else {
				var result = clientProps.dateBuffer.substring(0, end.index);
				clientProps.dateBuffer = clientProps.dateBuffer.substring(end[0].length + end.index);

				var callback = clientProps.callbackQueue.shift();
				if (end[0].match(/^ACK\s\[.*?\].*(?:\n|$)/)) callback(end[0]);
				else callback(null, result.trim());
			}

			welcom = clientProps.dateBuffer.match(/(^OK MPD.*?\n)/m);
			end = clientProps.dateBuffer.match(/(^OK(?:\n|$)|^ACK\s\[.*?\].*(?:\n|$))/m);
		}
	}
};

// Idle

MpdClient.prototype._funcIdleHandler = function(err, result) {
	if (err) {
		this.emit('warn', {
			desc: 'The server responded with an error on a idle request.',
			error: err
		});
	} else {
		result.split('\n').forEach(function(event) {
			// changed: player
			var changed = event.substring('changed: '.length);
			this.emit('changed', changed);
		}.bind(this));
	}

	this._funcIdleInit();
};

MpdClient.prototype._funcIdleInit = function() {
	if (!this._valueIdle.client.destroyed) {

		this._sendCommandWithCallback(
			this._valueIdle.client,
			this._valueIdle.callbackQueue,
			'idle',
			this._funcIdleHandler.bind(this));
	}
};

// Ping

MpdClient.prototype._funcNoIdleInit = function() {
	setInterval(function() {
		if (this._valueCore.client) {
			this._sendCommandWithoutCallback(this._valueCore.client, 'noidle');
		}
	}.bind(this), 60 * 1000);
}
