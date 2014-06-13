//за основу взят проет вот этого парня и перепилен https://github.com/andrewrk/mpd.js
//добавлен reconnect, и стиль изменен в соответствии с моим представлением о прекрасном

"use strict";

//require
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var net = require('net');

//end require

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
	this._valueCoreClient = null;
	this._valueCallbackQueue = [];
	this._valueDataBuffer = "";

	//end value
}

MpdClient.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcCoreClientInit();

		this._valueIsInit = true;
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

	this._sendCommandWithoutCallback('noidle');
	this._sendCommandWithCallback(rawCommand, callback);

	return this;
};

MpdClient.prototype._sendCommandWithCallback = function(rawCommand, callback) {
	this._valueCallbackQueue.push(callback);
	this._funcCoreClientSendData(new Command(rawCommand));
};

MpdClient.prototype._sendCommandWithoutCallback = function(rawCommand) {
	this._funcCoreClientSendData(new Command(rawCommand));
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

MpdClient.prototype._funcCoreClientSendData = function(data) {
	if (!this._valueCoreClient.destroyed) {
		this._valueCoreClient.write(data.toString());
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
		return '"' + arg.toString().replace(/"/g, '\\"') + '"';
	}).join(" ") + "\n";
};

//end sends

//CoreClient
MpdClient.prototype._funcCoreClientInit = function() {
	this._valueCoreClient = net.connect(this._paramConnectOptions)
		.on('connect', function() {
			this.emit('ready');
		}.bind(this))
		.on('error', function(error) {
			this.emit('error', {
				desc: 'Произошла ошибка соединения с mpd сервером.',
				error: error
			});
		}.bind(this))
		.on('data', this._funcCoreClientOnDataSubscriber.bind(this))
		.on('close', this._funcCoreClientReconect.bind(this));

	this._valueCoreClient.setEncoding('utf8');
};

MpdClient.prototype._funcCoreClientReconect = function() {
	this._valueCoreClient
		.removeAllListeners('connect')
		.removeAllListeners('error')
		.removeAllListeners('data')
		.removeAllListeners('close');

	if (this._paramReconnectOptions.isUse) {
		this.emit('warn', {
			desc: 'Предпринимается попытка переподключиться к серверу.',
			reconnectDelay: this._paramReconnectOptions.reconnectDelay
		});

		setTimeout(
			this._funcCoreClientInit.bind(this),
			this._paramReconnectOptions.reconnectDelay);
	} else {
		this.emit('error', {
			desc: 'Соединение с сервером закрылось, в соответствии с настройками реконект не будет произведен.'
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
MpdClient.prototype._funcCoreClientOnDataSubscriber = function(data) {
	this._valueDataBuffer += data;

	var welcom = this._valueDataBuffer.match(/(^OK MPD.*?\n)/m);
	var end = this._valueDataBuffer.match(/(^OK(?:\n|$)|^ACK\s\[.*?\].*(?:\n|$))/m);

	while (welcom || end) {
		if (welcom) {
			this._valueDataBuffer = this._valueDataBuffer.substring(welcom[0].length + welcom.index);
			this._funcIdleInit();
		} else {
			var result = this._valueDataBuffer.substring(0, end.index);
			this._valueDataBuffer = this._valueDataBuffer.substring(end[0].length + end.index);


			var callback = this._valueCallbackQueue.shift();
			if (end[0].match(/^ACK\s\[.*?\].*(?:\n|$)/)) callback(end[0]);
			else callback(null, result.trim());
		}

		welcom = this._valueDataBuffer.match(/(^OK MPD.*?\n)/m);
		end = this._valueDataBuffer.match(/(^OK(?:\n|$)|^ACK\s\[.*?\].*(?:\n|$))/m);
	}

	if (!this._valueCallbackQueue.length) {
		this._sendCommandWithCallback(
			'idle',
			this._funcIdleHandler.bind(this));
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
};

/**
	эта функция созданна для того чтобы наглядно показать, что
	именно ее вызов будет инициировать опрос сервера, после того 
	как сервер пришлет приглашающую строчку 'welcom'
	
*/
MpdClient.prototype._funcIdleInit = function() {
	this._sendCommandWithCallback(
		'idle',
		this._funcIdleHandler.bind(this));
};

//end idle