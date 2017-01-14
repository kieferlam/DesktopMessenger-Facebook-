"use strict";

const electron = require('electron');
const {app, BrowserWindow, Tray, Menu, Dialog} = electron;
const url = require('url');
const path = require('path');
const fs = require('fs');

const message_win_width = 360;

var ipc = electron.ipcMain;

var login = require('facebook-chat-api');
var loggedIn = false;

var displayingMessages = [];

var preloadedThreads = [];
const preloadThreadAmount = 10;

let tray = null;
function makeTrayIcon(api) {
	tray = new Tray('./img/ico24.png');
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Logout', type: 'normal' },
		{ type: 'separator' },
		{ label: 'Quit', type: 'normal' }
	])
	contextMenu.items[0].click = () => api.logout(() => app.quit());
	contextMenu.items[2].click = () => app.quit();
	tray.setToolTip('Kiefer Messenger')
	tray.setContextMenu(contextMenu)
}

app.on('ready', () => runLogin(true));

function runLogin(useAppState) {

	if (useAppState) {
		try {
			login({ appState: JSON.parse(fs.readFileSync('appstate.json', 'utf8')) }, (err, api) => {
				if (err) {
					console.error(err);
					runLogin(false);
				} else {
					loginSuccess(api);
				}
			});
		} catch (e) {
			console.error(e);
			runLogin(false);
		}

	} else {
		userLogin();
	}
}

function userLogin() {
	var loginWin = new BrowserWindow({ width: 360, height: 480, title: 'Login with Facebook' });
	loginWin.setMenuBarVisibility(false);
	loginWin.loadURL(url.format({
		pathname: path.join(__dirname, 'login.html'),
		protocol: 'file',
		slashes: true
	}));
	ipc.on('loginDomReady', (event, data) => {
		try { event.sender.send('setLastLogin', JSON.parse(fs.readFileSync('./prefs.json'))); } catch (e) {
			console.err(e);
			console.log('Error reading prefs.json.');
		}
	});
	loginWin.webContents.openDevTools();
	loginWin.once('closed', () => {
		if (!loggedIn) {
			app.quit();
		}
	});
	ipc.on('loginWithDetails', (event, data) => {
		console.log('Loggin in with ' + data.email);
		login({ email: data.email, password: data.password }, (err, api) => {
			if (err) {
				console.log('Login error.');
				event.sender.send('loginError', err);
				return console.error(err);
			}
			//Save email
			fs.writeFileSync('prefs.json', JSON.stringify({ lastLoginEmail: data.email }));
			console.log('Login success!');

			fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()));

			event.sender.send('loginSuccess');

			setTimeout(() => {
				loginSuccess(api);
				loginWin.close();
			}, 3000);

		});
	});
}

function loginSuccess(api) {
	const {width, height} = electron.screen.getPrimaryDisplay().workAreaSize;
	loggedIn = true;
	makeTrayIcon(api);

	//Preload thread data
	api.getThreadList(0, preloadThreadAmount - 1, (err, arr) => {
		if (err) return console.error(err);
		arr.forEach((elem, index) => {
			preloadedThreads.push(elem);
		});
	});

	api.listen((err, message) => {
		if (err) return console.error(err);
		console.log("New message from " + message.senderID + ": " + message.body);

		var existingMessages = displayingMessages.filter((msg) => msg.message.threadID == message.threadID);
		if (existingMessages.length > 0) {
			console.log('Appending message to existing window.');
			//Message already exists
			var existingWin = existingMessages[0];
			if (!existingWin.window.interacted) existingWin.window.restartCloseTimer();
			api.getUserInfo(message.senderID, function (err, ret) {
				if (err) return console.error(err);
				var userInfo = { userID: message.senderID, message_data: message, data: ret[message.senderID] };
				existingWin.window.webContents.send('anotherMessage', userInfo);
			});
		} else {
			console.log('New message window.');
			//Display new message
			var newWin = new BrowserWindow({
				width: message_win_width,
				height: 128,
				frame: false,
				transparent: true
			});
			displayingMessages.push({ window: newWin, message: message });
			newWin.setPosition(width, height - 128);
			newWin.setAlwaysOnTop(true);
			newWin.setSkipTaskbar(true);
			newWin.interacted = false;
			var autoCloseRunning = false;;
			// newWin.webContents.openDevTools();

			newWin.loadURL(url.format({
				pathname: path.join(__dirname, 'incomingmessage.html'),
				protocol: 'file',
				slashes: true
			}));

			const animateCloseFunction = function () {
				autoCloseRunning = true;
				const closeAnim = animate(
					0,
					message_win_width,
					300,
					(val) => newWin.setPosition(Math.round(width - (message_win_width - val)), newWin.getPosition()[1]),
					(x, dur) => {
						return Math.pow((0.003 * (1000 / dur) * x) + 1, -3);
					},
					() => newWin.close()
				);
			}

			newWin.autoCloseTimeout = setTimeout(animateCloseFunction, 5000);

			newWin.restartCloseTimer = function () {
				clearTimeout(newWin.autoCloseTimeout);
				newWin.autoCloseTimeout = setTimeout(animateCloseFunction, 5000);
			}

			newWin.forceAutoClose = function () {
				if (!autoCloseRunning) {
					clearTimeout(newWin.autoCloseTimeout);
					animateCloseFunction();
				}
			}

			ipc.once('messageInteracted', () => {
				newWin.interacted = true;
				clearTimeout(newWin.autoCloseTimeout);
			});

			ipc.once('messageDomReady', (event, arg) => {
				api.getUserInfo(message.senderID, function (err, ret) {
					if (err) return console.error(err);
					var userInfo = { userID: message.senderID, message: message, data: ret[message.senderID] };
					api.getThreadInfo(message.threadID, (err, threadData) => {
						if (err) return console.error(err);
						event.sender.send('initMessageDetails', threadData, userInfo);
					});
				});
			});

			ipc.once('readyToDisplay', (event, arg) => {
				console.log('Message window ready to display.');
				newWin.slideInAnim = animate(
					0,
					message_win_width,
					300,
					(val) => newWin.setPosition(Math.round(width - val), newWin.getPosition()[1]),
					(x, dur) => {
						return Math.pow((0.003 * (1000 / dur) * x) + 1, -3);
					}
				);
			});

			newWin.once('close', () => {
				console.log('Message window closed.');
				displayingMessages.splice(displayingMessages.indexOf(newWin));
			});

		}
	});
}

ipc.on('message_close', (event, arg) => {
	console.log('Request message close.');
	displayingMessages.filter((elem) => elem.window.webContents == event.sender.webContents).forEach((elem) => {
		elem.window.forceAutoClose();
	});
});

ipc.on('console.log', (event, arg) => {
	console.log(arg);
})

function animate(start, end, duration, stepFunction, timingFunction, callbackFunction = () => { }) {
	const startTime = Date.now();
	const deltaValue = end - start;
	var callback = false;
	const loop = setInterval(() => {
		var deltaTime = Date.now() - startTime;
		if (deltaTime >= duration) {
			callback = true;
			clearInterval(loop);
			deltaTime = duration;
		}
		stepFunction(start + ((1 - timingFunction(deltaTime, duration)) * deltaValue));
		if (callback) callbackFunction();
	}, 10);
	return loop;
}

ipc.on('pollPreloadedThreads', (event, args) => {
	preloadedThreads.forEach((elem, index) => {
		if (elem.threadID == args) {
			event.sender.send('preloadedThreadInfo', elem);
			return;
		}
	});
	event.sender.send('preloadedThreadInfo', null);
});

app.on('window-all-closed', () => { });