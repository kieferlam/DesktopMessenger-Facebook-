const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

$(document).ready(() => {
    ipc.send('profileDomLoaded');
});

ipc.once('loadFacebookData', (event, data)=>{
    event.sender.send('facebookDataLoaded');
});


function mainLog(log) {
    ipc.send('console.log', log);
}