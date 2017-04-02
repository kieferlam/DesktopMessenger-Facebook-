const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

window.onerror = function (error, url, line) {
    log("Error at line " + line + ": " + error);
};

const $ = require('jquery');
require('jquery.easing');

var thread = null;
var userID = null;
var messages = [];
var participantInfos = {};
var loadMessageSync = true;

$(document).ready(() => {
    ipc.send('conversation_DOM_loaded');
    setup();
});

function setup() {
    $('#conversation_messages-div').scroll((event) => {
        if ($('#conversation_messages-div').scrollTop() == 0 && loadMessageSync) {
            loadMessageSync = false;
            ipc.send('conversation_request_messages_async', thread.threadID);
        }
    });
}

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

    $('#conversation_messages-div').append(html);
}

function makeMessagesHTML(msgs) {
    var buffer = '';
    msgs.forEach((msg, index) => {
        var userInfo = participantInfos[msg.senderID];
        if (msg.senderID == userID) {
            buffer += getUserMessageHTML(userInfo, msg.body, msg.timestamp);
        } else {
            buffer += getMessageHTML(userInfo, msg.body, msg.timestamp);
        }
    });
    return buffer;
}

function appendMessages(msgs) {
    var append = makeMessagesHTML(msgs);
    $('#conversation_messages-div').prepend(append);
}

ipc.on('receive_history', (event, history) => {

    var shouldScroll = checkScrollLocked();
    //Store the difference in scroll from bottom
    var scrollFromBottom =  getBottomScroll() - $('#conversation_messages-div').scrollTop();

    messagesToAppend = [];

    history.forEach((msg, index) => {
        messages.push(msg);
        if (msg.type == 'message') {
            messagesToAppend.push(msg);
        }
    });

    appendMessages(messagesToAppend);

    //Should scroll to the bottom, not scroll at all
    if (shouldScroll) {
        scrollToBottom();
    }else{
        setScroll(getBottomScroll() - scrollFromBottom);        
    }

    loadMessageSync = true;

    event.sender.send('conversation_show');
});

function checkScrollLocked() {
    return $('#conversation_messages-div').scrollTop() >= $('#conversation_messages-div')[0].scrollHeight - $('#conversation_messages-div').height();
}

function setScroll(scroll){
    $('#conversation_messages-div').scrollTop(scroll);
}

function scrollTo(scroll) {
    $('#conversation_messages-div').animate({
        scrollTop: scroll
    }, 150, "easeOutQuint");
}

function getBottomScroll(){
    return $('#conversation_messages-div')[0].scrollHeight - $('#conversation_messages-div').height();
}

function scrollToBottom() {
    scrollTo(getBottomScroll());
}

function log(log) {
    ipc.send('console.log', log);
}