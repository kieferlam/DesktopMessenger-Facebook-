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

    //Send IPC: conversation_send_message_async
    $('#conversation_send_message-textarea').keydown((event) => {
        if (event.keyCode == 13 && !event.shiftKey) {
            sendUserTypedMessage($('#conversation_send_message-textarea').val());
        }
    });
    $('#conversation_send_message-textarea').keyup((event) => {
        if (event.keyCode == 13 && !event.shiftKey) {
            $('#conversation_send_message-textarea').val('');
        }
    });
    $('#conversation_send-button').click((event) => {
        sendUserTypedMessage($('#conversation_send_message-textarea').val());
        $('#conversation_send_message-textarea').val('');
    });
}

function sendUserTypedMessage(msg) {
    var shouldScroll = checkScrollLocked();
    var localMessageID = 'LOCAL_MID-' + Math.floor(Math.random() * 10000) + '-' + Date.now();
    log('Message send request: {threadID: ' + thread.threadID + ', body: ' + msg + '}');
    $('#conversation_messages-div').append(getUserMessageHTML(msg, Date.now(), localMessageID));
    $('#' + localMessageID).addClass('unsent');
    if (shouldScroll) scrollToBottom();
    ipc.send('conversation_send_message_async', thread.threadID, msg, localMessageID);
}

ipc.on('conversation_message_sent_async', (event, err, data) => {
    if (err) log(err);
    var message_info = data.info;
    var localMessageID = data.id;
    $('#' + localMessageID).removeClass('unsent');
});

ipc.on('receive_thread', (event, data) => {
    thread = data.thread;
    userID = data.userID;
    participantInfos = data.userInfos;

    var isGroup = thread.participantIDs.length > 2;
    var firstParticipant = data.userInfos[thread.participantIDs[0]];

    var convImgSrc = (isGroup) ? thread.imageSrc : firstParticipant.thumbSrc;
    var convName = (isGroup) ? thread.name : firstParticipant.name;

    ipc.send('conversation_set_title', {thread: thread, title: convName});

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

function getUserMessageHTML(msg, time, lmid) {
    var timestamp = 'You ' + makeTimestamp('', time);
    var userInfo = getOwnUserInfo();
    var html = '<div ' + (lmid != undefined ? ('id="' + lmid + '"') : '') + ' class="conversation_message-div"><div class="conversation_message_timestamp-div conversation_message_timestamp_user-div"><label>' + timestamp + '</label></div><div class="conversation_message_sender_img_user-div"><img src="' + userInfo.thumbSrc + '" class="conversation_message_sender-img" alt="Sender Image" /> </div> <div class="conversation_message_content_user-div"><p>' + buildMessageContent(msg) + '</p></div></div>';
    return html;
}

function buildMessageContent(msg) {
    var content = '';
    msg.attachments.forEach((attachment, index) => {
        switch (attachment.type) {
            case 'photo':
                content += '<img class="message-image clearfix" width="' + attachment.previewWidth + '" height="' + attachment.previewHeight + '" src="' + (attachment.hiresUrl || attachment.largePreviewUrl) + '" />';
                break;
            case 'animated_image':
                content += '<img class="message-image clearfix" width="' + attachment.previewWidth + '" height="' + attachment.previewHeight + '" src="' + attachment.previewUrl + '" />';
                break;
            case 'sticker':
                content += '<img class="message-image clearfix" width="' + attachment.width + '" height="' + attachment.height + '" src="' + attachment.url + '" />';;
                break;
            case 'video':
                content += '<video width="' + attachment.previewWidth + '" height="' + attachment.previewHeight + '">';
                content += '<source src="' + attachment.url + '" type="video/mp4">';
                content += '</video>'
                break;
            default:
                content += '[' + attachment.type + ']';
                break;
        }
    });
    content += msg.body;
    return content;
}

function getMessageHTML(userInfo, msg) {
    var timestamp = makeTimestamp(userInfo.name, msg.timestamp);
    var content = buildMessageContent(msg);
    var html = '<div class="conversation_message-div"> <div class="conversation_message_timestamp-div"> <label>' + timestamp + '</label></div><div class="conversation_message_sender_img-div"><img src="' + getUserImg(userInfo) + '" class="conversation_message_sender-img" alt="Sender Image" /></div><div class="conversation_message_content-div"><p>' + content + '</p></div></div>';
    return html;
}

function appendMessage(msg) {
    var userInfo = participantInfos[msg.senderID];
    var html = '';
    if (msg.senderID == userID) {
        html = getUserMessageHTML(msg, msg.timestamp);
    } else {
        html = getMessageHTML(userInfo, msg);
    }

    $('#conversation_messages-div').append(html);
}

function makeMessagesHTML(msgs) {
    var buffer = '';
    msgs.forEach((msg, index) => {
        var userInfo = participantInfos[msg.senderID];
        if (msg.senderID == userID) {
            buffer += getUserMessageHTML(msg, msg.timestamp);
        } else {
            buffer += getMessageHTML(userInfo, msg);
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
    var scrollFromBottom = getBottomScroll() - $('#conversation_messages-div').scrollTop();

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
    } else {
        setScroll(getBottomScroll() - scrollFromBottom);
    }

    loadMessageSync = true;

    event.sender.send('conversation_show');
});

ipc.on('receive_message', (event, msg) => {
    var shouldScroll = checkScrollLocked();
    //Store the difference in scroll from bottom
    var scrollFromBottom = getBottomScroll() - $('#conversation_messages-div').scrollTop();
    msg.timestamp = Date.now();
    $('#conversation_messages-div').append(makeMessagesHTML([msg]));
    if (shouldScroll) {
        scrollToBottom();
    } else {
        setScroll(getBottomScroll() - scrollFromBottom);
    }
});

function checkScrollLocked() {
    return $('#conversation_messages-div').scrollTop() >= $('#conversation_messages-div')[0].scrollHeight - $('#conversation_messages-div').height();
}

function setScroll(scroll) {
    $('#conversation_messages-div').scrollTop(scroll);
}

function scrollTo(scroll) {
    $('#conversation_messages-div').animate({
        scrollTop: scroll
    }, 150, "easeOutQuint");
}

function getBottomScroll() {
    return $('#conversation_messages-div')[0].scrollHeight - $('#conversation_messages-div').height();
}

function scrollToBottom() {
    scrollTo(getBottomScroll());
}

function getOwnUserInfo() {
    return participantInfos[userID];
}

function log(log) {
    ipc.send('console.log', log);
}