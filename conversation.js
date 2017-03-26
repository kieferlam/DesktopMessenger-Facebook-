const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

var thread = null;
var userID = null;
var messages = [];

$(document).ready(() => {
    ipc.send('conversation_DOM_loaded');
});

ipc.on('receive_thread', (event, data)=>{
    thread = data.thread;
    userID = data.userID;

    $('#conversation-img').attr('src', thread.imageSrc);
    $('#conversation_name-h1').text(thread.name);
});

ipc.on('receive_history', (event, history)=>{
    event.sender.send('conversation_show');
});