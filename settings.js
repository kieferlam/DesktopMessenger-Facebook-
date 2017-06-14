const electron = require('electron');

var ipc = electron.ipcRenderer;

const remote = electron.remote;

window.onerror = function(error, url, line){
    log("Error at line " + line + ": " + error);
};

const AutoLaunch = require('auto-launch');

const $ = require('jquery');

var settings;
var package;

var setting_panels = ['message_previews-li', 'application-li', 'system-li', 'about-li'];
var selected_panel = setting_panels[0];

$(document).ready(() => {
    settings = remote.getGlobal('settings');
    package = remote.getGlobal('package');
    setup();
});

function validate(number) {
    return !isNaN(number);
}

function setPanelListItemStyle() {
    setting_panels.forEach((panel_name) => {
        $('#' + panel_name).removeClass('settings_list_item_selected');
    });
    $('#' + selected_panel).addClass('settings_list_item_selected');
}

function setDisplaySettingsPanel() {
    var panelID = $('#' + selected_panel).attr('data-panel');
    //hide all panels
    setting_panels.forEach((panel_name) => {
        var pan_id = $('#' + panel_name).attr('data-panel');
        $('#' + pan_id).css({ display: 'none' });
    });
    //Show one panel
    $('#' + panelID).css({ display: 'unset' });
}

function setup() {
    setPanelListItemStyle();
    setDisplaySettingsPanel();
    setting_panels.forEach((panel_name) => {
        $('#' + panel_name).click((event) => {
            selected_panel = panel_name;
            setPanelListItemStyle();
            setDisplaySettingsPanel();
        });
    });

    setupMessagePreviewPanel();
    setupSystemPanel();
    setupAboutPanel();
}

function setupMessagePreviewPanel() {
    $('#message_display_period-number').val(settings.message_display_period);
    $('#message_display_period-number').on('mouseup keyup', (event) => {
        var value = $('#message_display_period-number').val();
        if (validate(value)) {
            $('#message_display_period-number').removeClass('error_outline');
            settings.message_display_period = value;
        } else {
            $('#message_display_period-number').addClass('error_outline');
        }
    });

    $('#message_allow_muted-checkbox').attr('checked', settings.quickMessagesAllowMuted);
    $('#message_allow_muted-checkbox').change(()=>{
        settings.quickMessagesAllowMuted = $('#message_allow_muted-checkbox').prop('checked');
    });
}

function setupSystemPanel() {
    var selfAutoLaunch = new AutoLaunch({ name: 'DesktopMessenger' });
    $('#launch_on_startup-checkbox').prop('checked', selfAutoLaunch.isEnabled());
    $('#launch_on_startup-checkbox').change((event)=>{
        if($('#launch_on_startup-checkbox').is(':checked')){
            log('Enabling launch on system startup.');
            selfAutoLaunch.enable((err)=>log('Error: Could\'t enable launch_on_startup.'));
        }else{
            log('Disabling launch on system startup.');
            selfAutoLaunch.disable((err)=>log('Error: Could\'t disable launch_on_startup.'));
        }
    });
}

function setupAboutPanel(){
    $('#about_application_name-h1').text(package.name);
    $('#about_version-h2').text('Version ' + package.version);
}

function log(log) {
    ipc.send('console.log', log);
}