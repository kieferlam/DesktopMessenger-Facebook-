const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

var textfillInterval;

function areLoginDetailsValid() {
    return true;
}

$(document).ready(() => {
    ipc.send('loginDomReady');
});

ipc.on('setLastLogin', (event, data) => {
    if (data.lastLoginEmail != undefined) {
        $('#email-field').val(data.lastLoginEmail);
    }
});

ipc.on('loginError', (event, data) => {
    $('#login-button').prop('disabled', false);
    clearInterval(textfillInterval);
    $('#info-container').html('<p class="info-error">' + data.error + '</p>');
});

function loginFunction(){
    if (areLoginDetailsValid()) {
        mainLog('Login details valid.');

        $('#login-button').prop('disabled', true);
        $('#info-container').html('<div id="loadingDiv"><div id="loadingMon"><div id="loadingScreen"><div id="screenContent"></div></div></div><div id="loadingMonStand"></div></div>');
        
        var textIndex = 0;
        var text = $('#email-field').val();
        var auth = $('#auth-field').val();
        textfillInterval = setInterval(() => {
            $('#screenContent').append('<span class="loadingChar">' + text[textIndex] + '</span>');
            if (textIndex > 5) $('#screenContent').find('span:first').remove();
            textIndex++;
            if (textIndex >= text.length) clearInterval(textfillInterval);
        }, 100);

        ipc.send('loginWithDetails', { email: $('#email-field').val(), password: $('#password-field').val(), auth: auth });
    }
}

$('#password-field').on('keydown', (event)=>{
    if(event.keyCode == 13){
        loginFunction();
    }
});

$('#auth-field').on('keydown', (event)=>{
    if(event.keyCode == 13){
        loginFunction();
    }
});

$('#login-button').click(loginFunction);

ipc.on('loginSuccess', ()=>{
    $('#info-container').html('<div class="successTick"> <div class="tickBase"></div> <div class="tickFlick"></div> </div>');
});

function mainLog(log) {
    ipc.send('console.log', log);
}