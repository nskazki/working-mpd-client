'use strict'

const MpdClient = require('../')
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
