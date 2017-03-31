const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

window.onerror = function (error, url, line) {
    mainLog("Error at line " + line + ": " + error);
};

const $ = require('jquery');

var thread = null;
var userID = null;
var messages = [];
var participantInfos = {};

$(document).ready(() => {
    ipc.send('conversation_DOM_loaded');
});

ipc.on('receive_thread', (event, data) => {
    thread = data.thread;
    userID = data.userID;
    participantInfos = data.userInfos;

    var isGroup = thread.participantIDs.length > 2;
    var firstParticipant = data.userInfos[thread.participantIDs[0]];

    var convImgSrc = (isGroup) ? thread.imageSrc : firstParticipant.thumbSrc;
    var convName = (isGroup) ? thread.name : firstParticipant.name;

    $('#conversation-img').attr('src', convImgSrc);
    $('#conversation_name-h1').text(convName);
});

function time_as_string(date) {
    return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
}

function makeTimestamp(name, time) {
    var date = new Date(time);
    var time = time_as_string(date);
    return time + ' ' + name;
}

function getUserImg(userInfo) {
    return userInfo.thumbSrc;
}

function getUserMessageHTML(userInfo, messageBody, time) {
    var timestamp = 'You ' + makeTimestamp('', time);
    var html = '<div class="conversation_message-div"><div class="conversation_message_timestamp-div conversation_message_timestamp_user-div"><label>' + timestamp + '</label></div><div class="conversation_message_sender_img_user-div"><img src="' + userInfo.thumbSrc + '" class="conversation_message_sender-img" alt="Sender Image" /> </div> <div class="conversation_message_content_user-div"><p>' + messageBody + '</p></div></div>';
    return html;
}

function getMessageHTML(userInfo, messageBody, time) {
    var timestamp = makeTimestamp(userInfo.name, time);
    var html = '<div class="conversation_message-div"> <div class="conversation_message_timestamp-div"> <label>' + timestamp + '</label></div><div class="conversation_message_sender_img-div"><img src="' + getUserImg(userInfo) + '" class="conversation_message_sender-img" alt="Sender Image" /></div><div class="conversation_message_content-div"><p>' + messageBody + '</p></div></div>';
    return html;
}

function appendMessage(msg) {
    var userInfo = participantInfos[msg.senderID];
    var html = '';
    if (msg.senderID == userID) {
        html = getUserMessageHTML(userInfo, msg.body, msg.timestamp);
    } else {
        html = getMessageHTML(userInfo, msg.body, msg.timestamp);
    }
    mainLog(msg);
    $('#conversation_messages-div').append(html);
}

ipc.on('receive_history', (event, history) => {

    history.forEach((msg, index) => {
        messages.push(msg);
        if (msg.type == 'message') {
            appendMessage(msg);
        }
    });

    event.sender.send('conversation_show');
});



function mainLog(log) {
    ipc.send('console.log', log);
}