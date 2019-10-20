# WorkingMpdClient

```
yarn add working-mpd-client
```

## Features

 - `working-mpd-client` supports the command sending
 - `working-mpd-client` allows subscribing on the server events (i.e. status updates)
 - `working-mpd-client` attempts to reconnect if the connection has been interrupted

## Example

```js
const mpdClient = new MpdClient({
  connectOptions: {
    host: 'localhost',
    port: 6600
  },
  reconnectOptions: {
    isUse: true,
    reconnectDelay: 2000
  }
}).on('error', console.error)
  .on('changed', (name) => {
    if (name === 'playlist') printPlaylist()
  })
  .on('ready', printPlaylist)
  .init()

function printPlaylist() {
  mpdClient.sendCommand('playlist', (err, result) => {
    if (err) {
      console.error(err)
    } else {
      console.log('\nnew playlist:\n' + result)
    }
  })
}
```

## Information events

 - `warn` - a channel to notify about maintainable problems.
    Example: a connection has been interrupted but an attempt to reconnect will be performed.
    Another example: a server responded with an error to a command that did not register a callback.
 - `error` - a channel to notify about critical problems.
    Example: a connection has been interrupted and a reconnect attempt won't be performed.

## Connection events

 - `ready` - a connection has been established
 - `disconnected` - a connection has been interrupted due to a problem or as the result of a `destroy` method call
 - `reconnecting` - an attempt to recconect is in progress
 - `reconnected` - an attempt to reconnect succeed
 - `destroyed` - a client has been destroyed

## Server events

 - `changed` - a server reported a change

## Known changes

 - `options` - an option has been changed (the repeat option or the random option for example)
 - `output` - an audio channel has been changed
 - `mixer` - the volume level has been changed
 - `player` - the playback has been paused, resumed, or stoped
 - `playlist` - the playlist has been changed
 - `update` - a database update has been started or completed
 - `database` - the track database has been updated

## Methods

 - `init` - establish a connection; `ready` event follows a method call
 - `destroy` - closes a connection and rejects all the callbacks left in the callbacks queue; `disconnected` and `destroyed` events follow a method call
 - `sendCommand` - sends a command to a server and calls a callback when the server responds to the command
 - `sendCommandList` - sends a list of commands to a server and calls a callback when the server responds to all the commands

## Ways to send a command

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
	}, 'play'])
```

## MPD documention

http://www.musicpd.org/doc/protocol/
