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
    var isGroup = thread.participantIDs.length > 2;

    var convImgSrc = (isGroup) ? thread.imageSrc : data.userInfo.thumbSrc;
    var convName = (isGroup) ? thread.name : data.userInfo.name;

    $('#conversation-img').attr('src', convImgSrc);
    $('#conversation_name-h1').text(convName);
});

ipc.on('receive_history', (event, history)=>{
    event.sender.send('conversation_show');
});



function mainLog(log) {
    ipc.send('console.log', log);
}