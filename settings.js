const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

var settings;

$(document).ready(() => {
    settings = remote.getGlobal('settings');
    setup();
});

function validate(number){
    return !isNaN(number);
}

function setup(){
    $('#message_display_period-number').val(settings.message_display_period);
    $('#message_display_period-number').on('mouseup keyup', (event)=>{
        var value = $('#message_display_period-number').val();
        if(validate(value)){
            $('#message_display_period-number').removeClass('error_outline');
            settings.message_display_period = value;
        }else{
            $('#message_display_period-number').addClass('error_outline');
        }
    });
}




function mainLog(log) {
    ipc.send('console.log', log);
}