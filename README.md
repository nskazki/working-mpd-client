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
	.sendCommadList([{
		cmd: 'add',
		args: 'somePath'
	}, 'play']);
```

<h5>Типы изменений происходящих на сервере:</h5>
 * options - изменение параметра repeat, random
 * output - включение\отключение аудиовыхода
 * mixer - уменьшение\увелечение громкости
 * player - остановка\пауза\воспроизведение
 * playlist - изменение плейлиста
 * update - начало или окончание обновления базы данных треков.
 * database - уведомление об обновлении базы данных треков.

<h5>Документация MPD:</h5>
[MPD Docs](http://www.musicpd.org/doc/protocol/)