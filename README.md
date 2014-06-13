WorkingMpdClient
=======

```
npm install working-mpd-client --save
```

<h5>Это клиент для MPD сервера, он умеет:</h5>
 * Отправлять на сервер команды, с калбеком или без.
 * Получать от сервера сведенья о произошедших на нем изменениях.
 * Автоматически переподключаться к серверу.

<h5>Example:</h5>
```js
var mpdClient = new MpdClient({
	connectOptions: {
		host: 'localhost',
		port: 6600
	},
	reconnectOptions: {
		isUse: true,
		reconnectDelay: 2000
	}
})
	.on('error', console.error)
	.on('changed', function(name) {
		if (name == "playlist") printPlaylist()
	})
	.on('ready', printPlaylist)
	.init();

function printPlaylist() {
	mpdClient.sendCommand('playlist', function(err, result) {
		if (err) console.error(err);
		else console.log('\nnew playlist:\n' + result);
	});
}
```

<h5>События которые может выбросить mpdClient: </h5>
 * `warn` - оповещения о проблемах не влияющих на дальнейшую работу программы, в частности: mpd сервер вернул ошибку на запрос изменения его состояния, или вернул ошибку на команду без callback, или соединение с сервером разорванно и принимается попытка переподключится. Выбрасывается с одним аргументом, лог объектом.
 * `error` - оповещение о проблемах нарушающих дальнейшую работу программы, в частности: разорванно соединение с mpd сервером и реконекта не будет. Выбрасывается с одним аргументом.
 
 * `ready` - соединение с mpd сервером установленно. Выбрасывается без аргументов.
 * `disconnected` - соединение с сервером разорванно, реконнект не будет произведен, в соответствии с настройками. Выбрасывается без аргументов.
 * `reconnecting` - соединение с сервером разорванно, производится переподключение. Выбрасывается без аргументов.
 * `changed` - Выбрасывается когда сервер сообил о произошедшем изменении. Содержит один аргумент, имя изменившейся сущности: 'output'\'mixer'...

<h5>Типы изменений происходящих на сервере:</h5>
 * `options` - изменение параметра repeat, random
 * `output` - включение\отключение аудиовыхода
 * `mixer` - уменьшение\увелечение громкости
 * `player` - остановка\пауза\воспроизведение
 * `playlist` - изменение плейлиста
 * `update` - начало или окончание обновления базы данных треков.
 * `database` - уведомление об обновлении базы данных треков.

<h5>Публичные методы класса:</h5>
 * `init` - инициализирует соединение с сервером.
 * `sendCommand` - отправляет одну команду на сервер, вызывает callback, после выполнения команды.
 * `sendCommandList` - отправляет несколько команд на сервер, вызывает callback, после выполнения всех команд. 

<h5>Допустимые форматы отправки каманды:</h5>
```js
mpdClient
	.sendCommand('status')
	.sendCommand('status', someHandler)
	.sendCommand({
		cmd: 'add',
		args: 'somePath'
	})
	.sendCommand({
		cmd: 'add',
		args: ['somePath', 'anotherSomePath']
	}, someHandler)
	.sendCommandList([{
		cmd: 'add',
		args: 'somePath'
	}, 'play']);
```

<h5>Документация MPD, из которой можно почерпнуть сведенья о формате команд для сервера:</h5>
[MPD Docs](http://www.musicpd.org/doc/protocol/)
