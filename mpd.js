/**
	https://github.com/nskazki/node-WorkingMpdClient
	MIT
	from russia with love, 2014
*/

/**
	За основу взят проет вот этого парня и перепилен https://github.com/andrewrk/mpd.js
	Добавлен reconnect, 
	
	Отделен транспорт для серверных команд, 
	от транспорта извещений сервера о произошедших в нем изменений.
	Потому что паралельный опрос сервера на предмет изменений и отправка команд
	пораждала странные и невоспроизводимые баги.

	И стиль изменен в соответствии с моим представлением о прекрасном

*/

/**
	Public:
	
		init
		destroy

		sendCommand
		sendCommandList
	
	Events:
	
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
"use strict";

//require
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var net = require('net');

//end require

//const
var DEBUG = false;

//end const

module.exports = MpdClient;

util.inherits(MpdClient, EventEmitter);

/**
	конструктор класса, возвращает неинициализированный объект.
	принимает параметры

	params = {
		connectOptions: {
			port: 6600,
			host: 'localhost'
		},
		reconnectOptions: {
			isUse: true,
			reconnectDelay: 1000 //msec
		}
	}
		
*/
function MpdClient(params) {
	//params
	this._paramConnectOptions = params.connectOptions;
	this._paramReconnectOptions = params.reconnectOptions;

	//end params

	//value
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

	//end value
}

MpdClient.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcClientInit(this._valueCore);
		this._funcClientInit(this._valueIdle);

		this.on('ready-idle', this._funcIdleInit.bind(this));
		this.on('reconnected-idle', this._funcIdleInit.bind(this));

		/**
			если в течении 4х минут ничего не отправлять на сервер, то 
			соединение автоматически закроется
			Jun 25 23:26 : client: [94] timeout
			
			поэтому раз в 1 минуту буду отправлять команду `noidle`
		*/
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

//sends

/**
	отправляет команду на сервер, а калбек помещает в очередь калбеков.
	так как сервер обрабатывает команды последовательно.
	
*/
MpdClient.prototype.sendCommand = function(rawCommand, callback) {
	if (!callback) callback = createDummyCallback(rawCommand).bind(this);

	this._sendCommandWithCallback(
		this._valueCore.client,
		this._valueCore.callbackQueue,
		rawCommand,
		callback);

	return this;
};

/**
	публичный метод для отправки списка команд на сервер
	rawCommandList = [rawCommand, ...]

*/
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

/**
	супер функция создающая калбек для команд без оного.

*/
function createDummyCallback(command) {
	return function(err) {
		if (err) this.emit('warn', {
			desc: 'Сервер вернул ошибку, на команду не зарегистриравшую callback.',
			command: command,
			error: err
		});
	};
}

/**
	конструктор структуры содержащей в себе имя команды и аргументы
	создан для наглядного приведения команды и аргументов к строковому типу
	который принимает mpd сервер

	rawCommand = {
		cmd = 'some string',
		arg = 'some value' or [] or empty
	}
	or
	rawCommand = 'some string'

*/
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
		// replace all " with \"
		return (arg !== undefined) ? ('"' + arg.toString().replace(/"/g, '\\"') + '"') : ' ';
	}).join(" ") + "\n";
};

//end sends

//CoreClient
/**
	this._valueIdle = {
		client: null,
		callbackQueue: [],
		dateBuffer: "",
		isReady: false
	};
*/
MpdClient.prototype._funcClientInit = function(clientProps) {
	clientProps.client = net.connect(this._paramConnectOptions)
		.on('connect', function() {
			this.emit('connected-' + clientProps.name);
			if (clientProps.name == 'core') this.emit('connected');
		}.bind(this))
		.on('error', function(error) {
			this.emit('error', {
				desc: 'Произошла ошибка соединения с mpd сервером. ' + clientProps.name,
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
				desc: 'Предпринимается попытка переподключиться к серверу. ' + clientProps.name,
				reconnectDelay: this._paramReconnectOptions.reconnectDelay
			});

			this.emit('reconnecting-' + clientProps.name);
			if (clientProps.name == 'core') this.emit('reconnecting');

			setTimeout(function() {
				this._funcClientInit(clientProps);
			}.bind(this), this._paramReconnectOptions.reconnectDelay);
		} else {
			this.emit('error', {
				desc: 'Соединение с сервером закрылось, в соответствии с настройками реконект не будет произведен.'
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
			desc: "Соединение с сервером закрылось. " + clientName
		});
	}
};

/**
	подписчик для ответов сервера.
	в буфере части ответов накапливаются.

	строчка соответствующая шаблону 'welcom' будет принята только один раз.
	будучи обнаруженной она выпиливается из буфера.
	и инициализируется режим простоя 'idle'. 
	который заключается в опросе сервера на предмет изменений с последнего опроса.

	вообще там довольно странный механизм, сути его работы я не познал, но есть "правила"
	- для того чтобы получить список изменений на сервере нужно отправить команду idle
	- перед тем как изменить что нибудь на сервере (например трек переключить) нужно отправить команду noidle
	- отправлять idle после того как вернул результат выполнения всех других команд.

	теперь насчет шаблона 'end'
	он находит завершающую строчку результата выполнения команды сервером.
	если таковая найденна, то из буфера вырезается строка с нулевого индекса и до начала 'end'
	и буфер от нее и 'end' очищаетя

	так как сервер возвращает результаты в том же, что получает и выполняет команды, я 
	просто изврекая самый старый калбек из очереди и отдаю ему или ошибку если получил код 'ACK'
	или 'result' если в 'end' содержится 'OK'.

	когда в буфере не остается пригодных к обработке результатов, я проверяю остались ли команды
	ожидающие выполнения, если нет то опрашиваю сервер командой 'idle'

*/
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

//end CoreClient

//idle
MpdClient.prototype._funcIdleHandler = function(err, result) {
	if (err) {
		this.emit('warn', {
			desc: 'На запрос изменений состояния сервера вернулась ошибка.',
			error: err
		});
	} else {
		result.split('\n').forEach(function(event) {
			//changed: player
			var changed = event.substring('changed: '.length);
			this.emit('changed', changed);
		}.bind(this));
	}

	this._funcIdleInit();
};

/**
	эта функция созданна для того чтобы наглядно показать, что
	именно ее вызов будет инициировать опрос сервера, после того 
	как сервер пришлет приглашающую строчку 'welcom'
	
*/
MpdClient.prototype._funcIdleInit = function() {
	if (!this._valueIdle.client.destroyed) {

		this._sendCommandWithCallback(
			this._valueIdle.client,
			this._valueIdle.callbackQueue,
			'idle',
			this._funcIdleHandler.bind(this));
	}
};

//end idle

MpdClient.prototype._funcNoIdleInit = function() {
	setInterval(function() {
		if (this._valueCore.client) {
			this._sendCommandWithoutCallback(this._valueCore.client, 'noidle');
		}
	}.bind(this), 60 * 1000);
}