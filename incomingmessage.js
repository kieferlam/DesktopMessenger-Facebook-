const electron = require('electron');

const remote = electron.remote;

const DEBUG_LOCAL_MODE = remote.getGlobal('DEBUG_LOCAL_MODE');

var ipc = electron.ipcRenderer;

window.onerror = function (error, url, line) {
    log("Error at line " + line + ": " + error);
};

const $ = require('jquery');
require('jquery.easing');

var interacted = false;

var oldScrollHeight = 0;

var threadID;

var completeData;
var userInfo;

var lastSenderID = 0;
var lastMessageTime = '0';

$(document).ready(() => {
    ipc.send('messageDomReady');
    $('#content-div').addClass('translucent');
});

$(document).click(() => {
    interacted = true;
    ipc.send('messageInteracted');
    $('#content-div').removeClass('translucent');
});

ipc.on('profile_picture_loaded', (event, data) => {
    if (data.isThread && data.threadID == threadID) {
        $('#thread_pic').attr('src', data.data.url);
    }
});

ipc.once('initMessageDetails', (event, threadinfo, messageInfo, preloadedUserInfo) => {
    log('Initial message update.');
    threadID = messageInfo.message.threadID;
    userInfo = preloadedUserInfo;
    completeData = { threadInfo: threadinfo, userInfo: messageInfo, message: messageInfo.message };
    if (!DEBUG_LOCAL_MODE) {
        event.sender.send('pollPreloadedThreads', threadID);
        ipc.once('preloadedThreadInfo', (event, threadData) => {
            if (threadData == null) {
                threadData = { imageSrc: null };
            }
            var threadPic = threadData.imageSrc == null ? messageInfo.data.thumbSrc : threadData.imageSrc;
            $('#thread_pic').attr('src', threadPic);
            $('#thread_name').text(threadinfo.name);
            var sender_name = messageInfo.data.name + ((messageInfo.data.alternateName != undefined) ? ' (' + messageInfo.data.alternateName + ')' : '');
            $('#sender_name').text(messageInfo.data.isGroup ? sender_name : '');
            appendMessage(messageInfo.message);
            ipc.send('request_profile_picture_load', { friends: null, threads: [threadinfo] });
            event.sender.send('readyToDisplay', $('body')[0].scrollHeight);
        });
    } else {
        /*$('#thread_pic').attr('src', 'https://scontent.cdninstagram.com/t51.2885-15/s480x480/e35/c0.132.1059.1059/15538666_155311788287580_7134709718320152576_n.jpg?ig_cache_key=MTQxODA1NjMwOTQ0NTcyMTYyOA%3D%3D.2.c');
        $('#thread_name').text('Rick');*/
        appendMessage(messageInfo.message);
        event.sender.send('readyToDisplay', $('body')[0].scrollHeight);
    }
});

ipc.on('anotherMessage', (event, userInfo) => {
    log('Appending message.');
    appendMessage(userInfo.message_data);
    resize();
});

function appendMessage(message) {
    //Scroll to bottom after message append if the window is already scrolled to the bottom, otherwise stay.
    var doScroll = false;
    if (!($(window).scrollTop() < $(document).height() - $(window).height())) {
        doScroll = true;
    }

    //Actual message append
    var date = new Date(Date.now());
    var acc_to_min = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
    if (lastSenderID != message.senderID || lastMessageTime != acc_to_min) {
        lastSenderID = message.senderID;
        var timestamp = timestamp_html(date);
        lastMessageTime = acc_to_min;
        $('#messages_container').append('<div class="message-container">' + sender_img_html(message) + timestamp + message_html(message) + '</div>');
    } else {
        $('#messages_container').append('<div class="message-container">' + message_html(message) + '</div>');
    }
    $('#content-div').height($('body')[0].scrollHeight);

    //Scroll
    if (doScroll) {
        log('Scrolling to bottom.');
        $('html, body').animate({
            scrollTop: $(document).height() - $(window).height()
        },
            250,
            "easeOutQuint"
        );
    }
}

function sender_img_html(message) {
    return '';
}

function message_html(message) {
    var content = '';
    if (Array.isArray(message.attachments))
        message.attachments.forEach((attachment, index) => {
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
    content += message.body;
    return '<p class="message-body clearfix">' + content + '</p>';
}

function sender_name() {
    if (completeData.message.isGroup && completeData.threadInfo.nicknames != null) {
        var nick = completeData.threadInfo.nicknames[lastSenderID.toString()];
        if (nick != null) return nick + ' (' + userInfo[lastSenderID].name + ') ';
    }
    return DEBUG_LOCAL_MODE ? 'Rick' : userInfo[lastSenderID].name;
}

function timestamp_html(date) {
    return '<p class="timestamp">' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ' ' + sender_name() + '</p>';
}

function userTimestamp(date, timestampId) {
    return '<p id="' + timestampId + '" class="userTimestamp"> ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ' </p>';
}

$('#close_button').click(() => {
    ipc.send('message_close');
});

function userMessagePara(messageId, replyMsg) {
    return '<p id="' + messageId + '" class="user-message-body unsent"> ' + replyMsg + ' </p>';
}

function appendUserMessage(messageId, replyMsg, timestampId) {
    var nowDate = new Date(Date.now());
    var timestamp = nowDate.getHours() + ':' + nowDate.getMinutes();
    if (lastSenderID != 'user' || lastMessageTime != timestamp) {
        var msgHtml = '<div class="user-message-container">' + userTimestamp(nowDate, timestampId) + userMessagePara(messageId, replyMsg) + '</div>';
        lastSenderID = 'user';
        lastMessageTime = timestamp;
    } else {
        var msgHtml = '<div class="user-message-container">' + userMessagePara(messageId, replyMsg) + '</div>';
    }
    $('#messages_container').append(msgHtml);
    $('#content-div').height($('body')[0].scrollHeight);

    log('Scrolling to bottom.');
    $('html, body').animate({
        scrollTop: $(document).height() - $(window).height()
    },
        250,
        "easeOutQuint"
    );
}

function sendMsg(replyMsg) {
    var messageId = Math.floor(Math.random() * 100000);
    var timestampId = Math.floor(Math.random() * 100000);
    appendUserMessage(messageId, replyMsg, timestampId);
    if (!DEBUG_LOCAL_MODE) {
        //Send via api
        ipc.send('apiSend', { body: replyMsg, thread: threadID });
        ipc.once('apiSendCallback', (event, err, msgInfo) => {
            $('#' + messageId).removeClass('unsent');
            $('#' + timestampId).val(msgInfo.timestamp);
            if (err) {
                $('#' + messageId).addClass('sendError');
                log(err.error);
            }
        });
    }
}

$('#reply_button').click(() => {
    $('#message-main').append('<div id="reply-div"> <textarea id="reply_message" res></textarea> <button id="reply_send"></button> </div>');
    $('#reply_button').hide();
    const minHeight = 32;
    const maxHeight = 96;
    var shiftDown = false;
    function sendFunction() {
        var replyMsg = $('#reply_message').val();
        if (replyMsg.length <= 0) return;
        sendMsg(replyMsg);
    }
    $('#reply_message').on('keyup keydown', (event) => {
        shiftDown = event.shiftKey;
        if (event.keyCode == 13 && !shiftDown) {
            if (event.type == 'keydown') {
                sendFunction();
            } else {
                $('#reply_message').val('');
                $('#reply_message').height(minHeight);
                resize();
            }
        }
    });
    $('#reply_message').on('input', (event) => {
        while ($('#reply_message').height() == $('#reply_message')[0].scrollHeight && $('#reply_message').height() > minHeight) {
            $('#reply_message').height($('#reply_message').height() - 1);
        }
        while ($('#reply_message')[0].scrollHeight > $('#reply_message').height() && $('#reply_message').height() < maxHeight) {
            $('#reply_message').height($('#reply_message').height() + 1);
        }
        resize();
    });
    $('#reply_send').click(sendFunction);
    resize();
});

function resize() {
    $('#content-div').height($('body')[0].scrollHeight);
    ipc.send('resizeHeight', $('body')[0].scrollHeight);
}

function log(log) {
    ipc.send('console.log', log);
}