const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

function areLoginDetailsValid(){
    return true;
}

$(document).ready(()=>ipc.send('loginDomReady'));

ipc.on('setLastLogin', (event, data)=>{
    if(data.lastLoginEmail != undefined){
        $('#email-field').val(data.lastLoginEmail);
    }
});

$('#login-button').click(()=>{
    if(areLoginDetailsValid()){
        mainLog('Login details valid.');
        ipc.send('loginWithDetails', {email: $('#email-field').val(), password: $('#password-field').val()});
    }
});



function mainLog(log) {
    ipc.send('console.log', log);
}