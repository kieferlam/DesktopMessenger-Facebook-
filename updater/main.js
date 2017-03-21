"use strict";

const electron = require('electron');
//globalShortcut for global keyboard events for testing
const { app, BrowserWindow, dialog } = electron;
const url = require('url');
const path = require('path');
const fs = require('original-fs');
const request = require('request');
const https = require('https');
const spawn = require('child_process').spawn;

const message_win_width = 360;

const os = require('os');
const isLinux = os.platform == 'linux';
const isWindows = os.platform == 'win32';
const isMac = os.platform == 'darwin';

function quitAndRunApp() {
    console.log('Quitting updater and running app...');
    var child_proc = spawn(app.getPath('exe'), [], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore']
    });
    child_proc.unref();
    app.quit();
}

function updateApp(ver) {
    console.log('Updating app...');
    var file = fs.createWriteStream(path.dirname(app.getPath('exe')) + '/resources/DesktopMessenger.asar');
    console.log('Created file write stream.');
    console.log('Querying download file.');
    var dl_url = 'https://raw.githubusercontent.com/mangopearapples/DesktopMessenger/master/release/' + ver + '/DesktopMessenger.asar';
    var req = https.get(dl_url, (response) => {
        response.on('data', (chunk)=>{
            file.write(chunk);
        });
        response.on('end', ()=>{
            file.end(()=>quitAndRunApp());
        });
    });
}

app.on('ready', () => {
    console.log('Started updater app.');
    dialog.showMessageBox({
        title: 'Update DesktopMessenger',
        type: 'question',
        message: 'We\'re about to download the DesktopMessenger update. Would you like to continue?',
        buttons: ['No', 'Yes']
    }, (response) => {
        if (response != 0) {
            console.log('Continuing with update.');
            var electronPath = path.dirname(app.getPath('exe'));
            console.log('Electron path: ' + electronPath);
            if (process.argv[2] == undefined) {
                console.log('No version argument provided.')
                process.argv[2] = '0.0.0';
            }
            var currentVersion = parseInt(process.argv[2].replace(/\./g, ''));
            console.log('Current version: ' + currentVersion);

            var latest_ver;
            request('https://raw.githubusercontent.com/mangopearapples/DesktopMessenger/master/release/LATEST_VERSION', (error, response, data) => {
                console.log('Latest version raw: ' + data);
                latest_ver = parseInt(data.replace(/\./g, ''));
                console.log('Latest version: ' + latest_ver);
                if (currentVersion >= latest_ver) {
                    console.log('Current version is larger than latest version.');
                    dialog.showMessageBox({
                        title: 'Update DesktopMessenger',
                        type: 'info',
                        message: 'You already have the latest version of DesktopMessenger.',
                    }, () => {
                        quitAndRunApp();
                    });
                } else {
                    updateApp(data);
                }
            });
        } else {
            console.log('Abort update.');
            app.quit();
        }
    });
});

process.on('uncaughtException', (err) => {
    console.log(err);
    app.quit();
});