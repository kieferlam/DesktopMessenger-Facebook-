const electron = require('electron');

const remote = electron.remote;

const DEBUG_LOCAL_MODE = remote.getGlobal('DEBUG_LOCAL_MODE');

var ipc = electron.ipcRenderer;

const $ = require('jquery');

var interacted = false;

var oldScrollHeight = 0;

var threadId;

var completeData;

$(document).ready(() => {
    ipc.send('messageDomReady');
    $('#content-div').addClass('translucent');
});

$(document).click(() => {
    interacted = true;
    ipc.send('messageInteracted');
    $('#content-div').removeClass('translucent');
});

ipc.once('initMessageDetails', (event, threadinfo, userInfo) => {
    mainLog('Initial message update.');
    threadId = userInfo.message.threadID;
    completeData = {threadInfo: threadinfo, userInfo: userInfo, message: userInfo.message};
    if(!DEBUG_LOCAL_MODE) {
        event.sender.send('pollPreloadedThreads', userInfo.message.threadID);
        ipc.once('preloadedThreadInfo', (event, threadData)=>{
            if(threadData == null){
                threadData = {imageSrc: null};
            }
            $('#thread_pic').attr('src', threadData.imageSrc == null ? userInfo.data.thumbSrc : threadData.imageSrc);
            $('#thread_name').text(threadinfo.name);
            var sender_name = userInfo.data.name + ((userInfo.data.alternateName != undefined) ? ' (' + userInfo.data.alternateName + ')' : '');
            $('#sender_name').text(userInfo.data.isGroup ? sender_name:'');
            appendMessage(userInfo.message);
            event.sender.send('readyToDisplay', $('body')[0].scrollHeight);
        });
    } else {
        appendMessage(userInfo.message);
        event.sender.send('readyToDisplay', $('body')[0].scrollHeight);
    } 
});

ipc.on('anotherMessage', (event, userInfo) => {
    mainLog('Appending message.');
    appendMessage(userInfo.message_data);
    event.sender.send('resizeHeight', $('body')[0].scrollHeight);
});

function appendMessage(message) {
    $('#messages_container').append('<div class="message-container">' + sender_img_html(message) + timestamp_html(new Date(Date.now())) + message_html(message) + '</div>');
    $('#content-div').height($('body')[0].scrollHeight);
}

function sender_img_html(message){
    return '';
}

function message_html(message){
    return '<p class="message-body">' + message.body + '</p>';
}

function sender_name(){
    if(completeData.message.isGroup){
        var nick = completeData.threadInfo.nicknames[completeData.message.senderID.toString()];
        if(nick != null) return nick + ' (' + completeData.userInfo.data.name + ') ';
    }
    return completeData.userInfo.data.name;
}

function timestamp_html(date){
    return '<p class="timestamp">' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ' ' + sender_name() + '</p>';
}

function userTimestamp(date, timestampId){
    return '<p id="'+timestampId+'" class="userTimestamp"> ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ' </p>';
}

$('#close_button').click(() => {
    ipc.send('message_close');
});

function userMessagePara(messageId, replyMsg){
    return '<p id="'+messageId+'" class="user-message-body unsent"> ' + replyMsg + ' </p>';
}

function appendUserMessage(messageId, replyMsg, timestampId){
    var msgHtml = '<div class="user-message-container">' + userTimestamp(new Date(Date.now()), timestampId) + userMessagePara(messageId, replyMsg) + '</div>';
    $('#messages_container').append(msgHtml);  
    $('#content-div').height($('body')[0].scrollHeight);
}

function sendMsg(replyMsg){
        var messageId = Math.floor(Math.random() * 100000);
        var timestampId = Math.floor(Math.random() * 100000);
        appendUserMessage(messageId, replyMsg, timestampId);
        if(!DEBUG_LOCAL_MODE){
            //Send via api
            ipc.send('apiSend', {body: replyMsg, thread: threadId});
            ipc.once('apiSendCallback', (event, err, msgInfo)=>{
                $('#'+messageId).removeClass('unsent');
                $('#'+timestampId).val(msgInfo.timestamp);
                if(err){
                    $('#'+messageId).addClass('sendError');
                    mainLog(err.error);
                }
            });
        }
}

$('#reply_button').click(()=>{
    $('#message-main').append('<div id="reply-div"> <textarea id="reply_message" res></textarea> <button id="reply_send"></button> </div>');
    $('#reply_button').hide();
    const minHeight = 32;
    const maxHeight = 96;
    var shiftDown = false;
    function sendFunction(){
        var replyMsg = $('#reply_message').val();
        if(replyMsg.length <= 0) return;
        sendMsg(replyMsg);
        $('#reply_message').val('');
        $('#reply_message').height(minHeight);
        resize();
    }
    $('#reply_message').on('keyup keydown', (event)=> {
        shiftDown = event.shiftKey;
        if(event.keyCode == 13 && event.type == 'keydown'){
            sendFunction();
        }
    });
    $('#reply_message').on('input', (event)=>{
        while($('#reply_message').height() == $('#reply_message')[0].scrollHeight && $('#reply_message').height() > minHeight){
            $('#reply_message').height($('#reply_message').height() - 1);
        }
        while($('#reply_message')[0].scrollHeight > $('#reply_message').height() && $('#reply_message').height() < maxHeight){
            $('#reply_message').height($('#reply_message').height() + 1);
        }
        resize();
    });
    $('#reply_send').click(sendFunction);
    resize();
});

function resize(){
    $('#content-div').height($('body')[0].scrollHeight);
    ipc.send('resizeHeight', $('body')[0].scrollHeight);
}

function mainLog(log) {
    ipc.send('console.log', log);
}