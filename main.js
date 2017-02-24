"use strict";

const electron = require('electron');
//globalShortcut for global keyboard events for testing
const {app, BrowserWindow, Tray, Menu, Dialog, globalShortcut} = electron;
const url = require('url');
const path = require('path');
const fs = require('fs');

const message_win_width = 360;

const os = require('os');
const isLinux = os.platform == 'linux';
const isWindows = os.platform == 'win32';
const isMac = os.platform == 'darwin';

//TURN THIS OFF FOR DEPLOY
const DEBUG_LOCAL_MODE = false;
global.DEBUG_LOCAL_MODE = DEBUG_LOCAL_MODE;

var ipc = electron.ipcMain;

var login = require('facebook-chat-api');
var loggedIn = false;

var displayingMessages = [];

var preloadedThreads = [];
const preloadThreadAmount = 10;

var workAreaSize = {};
var quickMessageMaxHeight;

let tray = null;
function makeTrayIcon(api) {
	tray = new Tray('./img/ico24.png');
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Logout', type: 'normal' },
		{ type: 'separator' },
		{ label: 'Quit', type: 'normal' }
	])
	if (!DEBUG_LOCAL_MODE) contextMenu.items[0].click = () => api.logout(() => app.quit());
	contextMenu.items[2].click = () => app.quit();
	tray.setToolTip('Kiefer Messenger')
	tray.setContextMenu(contextMenu)
}

app.on('ready', () => {
	if (DEBUG_LOCAL_MODE) {
		const debugMsg1 = globalShortcut.register('CmdOrCtrl+M', () => {
			handleMessage(null, {
				senderID: 'TestID',
				body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus imperdiet tristique nunc in tristique. Etiam fringilla ligula magna, quis aliquam.',
				threadID: 'TestThreadID',
				messageID: 'TestMsgID',
				attachments: [],
				isGroup: false
			});
		});
		const debugMsg2 = globalShortcut.register('CmdOrCtrl+L', () => {
			handleMessage(null, {
				senderID: 'TestID2',
				body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus imperdiet tristique nunc in tristique. Etiam fringilla ligula magna, quis aliquam.',
				threadID: 'TestThreadID2',
				messageID: 'TestMsgID2',
				attachments: [],
				isGroup: false
			});
		});
		const debugMsg3 = globalShortcut.register('CmdOrCtrl+H', () => {
			handleMessage(null, {
				senderID: 'TestID3',
				body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus imperdiet tristique nunc in tristique. Etiam fringilla ligula magna, quis aliquam.',
				threadID: 'TestThreadID3',
				messageID: 'TestMsgID3',
				attachments: [],
				isGroup: false
			});
		});
	}
	runLogin(true);
});

app.on('before-quit', () => {
	globalShortcut.unregisterAll();
});

function runLogin(useAppState) {

	if (DEBUG_LOCAL_MODE) {
		console.log('Debug mode. Skipping login.');
		loginSuccess(null);
	}
	else {
		if (useAppState) {
			try {
				login({ appState: JSON.parse(fs.readFileSync('appstate.json', 'utf8')) }, (err, api) => {
					if (err) {
						console.log('Appstate login error.');
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


}

function userLogin() {
	var loginWin = new BrowserWindow({ width: 360, height: 540, title: 'Login with Facebook' });
	loginWin.setMenuBarVisibility(false);
	// loginWin.webContents.openDevTools();
	loginWin.loadURL(url.format({
		pathname: path.join(__dirname, 'login.html'),
		protocol: 'file',
		slashes: true
	}));
	ipc.on('loginDomReady', (event, data) => {
		try { event.sender.send('setLastLogin', JSON.parse(fs.readFileSync('./prefs.json'))); } catch (e) {
			console.error(e);
			console.log('Error reading prefs.json.');
		}
	});
	loginWin.once('closed', () => {
		if (!loggedIn) {
			app.quit();
		}
	});
	ipc.on('loginWithDetails', (event, data) => {
		console.log('Logging in with ' + data.email);
		login({ email: data.email, password: data.password }, { forceLogin: true }, (err, api) => {
			if (err) {
				console.log('Login error.');

				if (err.error == 'login-approval') {
					if (data.auth == '') {
						console.log('No auth code.');
						err.error = 'Please enter authentication code.';
						event.sender.send('loginError', err);
						return console.error(err);
					} else {
						console.log('Logging in with auth code.');
						err.continue(data.auth);
					}
				} else {
					event.sender.send('loginError', err);
					return console.error(err);
				}
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
	workAreaSize = { width: width, height: height };
	quickMessageMaxHeight = Math.floor(workAreaSize.height * (1.0 / 3.0));
	loggedIn = true;
	makeTrayIcon(api);

	//Preload thread data
	if (!DEBUG_LOCAL_MODE) api.getThreadList(0, preloadThreadAmount - 1, (err, arr) => {
		if (err) return console.error(err);
		arr.forEach((elem, index) => {
			preloadedThreads.push(elem);
		});
		console.log('Preloaded ' + preloadedThreads.length + ' threads.');
	});

	if (!DEBUG_LOCAL_MODE) api.listen((err, message) => {
		if (err) return console.error(err);
		handleMessage(api, message);
	});
}

function calculateWinHeights(curr = 999) {
	var currentHeight = 0;
	displayingMessages.forEach((elem, index) => {
		if (index < curr) {
			currentHeight += elem.window.getSize()[1];
		}
	});
	return currentHeight;
}

function handleMessage(api, message) {
	console.log("New message from " + message.senderID + ": " + message.body);

	var existingMessages = displayingMessages.filter((msg) => msg.message.threadID == message.threadID);
	if (existingMessages.length > 0) {
		console.log('Appending message to existing window.');
		//Message already exists
		var existingWin = existingMessages[0];
		if (!existingWin.window.interacted) existingWin.window.restartCloseTimer();
		if (!DEBUG_LOCAL_MODE) api.getUserInfo(message.senderID, function (err, ret) {
			if (err) return console.error(err);
			var userInfo = { userID: message.senderID, message_data: message, data: ret[message.senderID] };
			existingWin.window.webContents.send('anotherMessage', userInfo);
		});
		else
			existingWin.window.webContents.send('anotherMessage', { userID: message.senderID, message_data: message });
	} else {
		console.log('New message window.');
		//Display new message
		var newWin = new BrowserWindow({
			width: message_win_width,
			height: 128,
			frame: false,
			transparent: true,
			resizable: false,
			show: false,
			icon: './img/ico24.png',
			alwaysOnTop: true,
			skipTaskbar: true
		});
		newWin.isDisplaying = false;
		var msgWinObj = { window: newWin, message: message, api: api };
		newWin.setPosition(workAreaSize.width, workAreaSize.height - newWin.getPosition()[1] - calculateWinHeights());
		displayingMessages.push(msgWinObj);
		newWin.interacted = false;
		var autoCloseRunning = false;
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
				(val) => newWin.setPosition(Math.round(workAreaSize.width - (message_win_width - val)), newWin.getPosition()[1]),
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
			console.log('Message DOM ready.');
			if (!DEBUG_LOCAL_MODE) api.getUserInfo(message.senderID, function (err, ret) {
				if (err) return console.error(err);
				var userInfo = { userID: message.senderID, message: message, data: ret[message.senderID] };
				api.getThreadInfo(message.threadID, (err, threadData) => {
					if (err) return console.error(err);
					event.sender.send('initMessageDetails', threadData, userInfo);
				});
			});
			else
				event.sender.send('initMessageDetails', {}, { message: message });
		});

		ipc.once('readyToDisplay', (event, height) => {
			try {
				console.log('Message window ready to display with height of ' + height);
				if (height > quickMessageMaxHeight) height = quickMessageMaxHeight;
				newWin.setSize(newWin.getSize()[0], height);
				newWin.setPosition(workAreaSize.width, workAreaSize.height - height - calculateWinHeights(displayingMessages.indexOf(msgWinObj)));
				newWin.show();
				newWin.isDisplaying = true;
				if (newWin.slideInAnim != 0 && !isLinux) {
					newWin.slideInAnim = animate(
						0,
						message_win_width,
						300,
						(val) => newWin.setPosition(Math.round(workAreaSize.width - val), newWin.getPosition()[1]),
						(x, dur) => {
							return Math.pow((0.003 * (1000 / dur) * x) + 1, -3);
						},
						() => newWin.slideInAnim = 0
					);
				}
			} catch (e) {
				console.error(e);
				console.log('Window object: ');
				console.log(newWin);
				console.log('Window webContents: ');
				console.log(newWin.webContents);
			}
		});

		newWin.once('close', () => {
			console.log('Message window (' + displayingMessages.indexOf(msgWinObj) + ') closed.');
			displayingMessages.splice(displayingMessages.indexOf(msgWinObj), 1);
		});

		console.log('Finished setting up.');
	}
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
	var loop = setInterval(() => {
		var deltaTime = Date.now() - startTime;
		if (deltaTime >= duration || Math.abs(end - start) < 0.001) {
			deltaTime = duration;
			try {
				stepFunction(end);
			} catch (e) {
				console.log('Error in animate, step function (end).');
				console.log(e);
			} finally {
				try {
					callbackFunction();
				} catch (e2) {
					console.log('Error in animate, callback function.');
					console.log(e2);
				} finally {
					clearInterval(loop);
				}
			}
		} else {
			try {
				stepFunction(start + ((1 - timingFunction(deltaTime, duration)) * deltaValue));
			} catch (e) {
				console.log('Error in animate, step function.');
				console.log(e);
				clearInterval(loop);
			}
		}
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

ipc.on('resizeHeight', (event, height) => {
	displayingMessages.filter((elem) => elem.window.webContents == event.sender.webContents).forEach((elem, index) => {
		var originalHeight = elem.window.getSize()[1];
		console.log('Resizing window height from ' + originalHeight + ' to ' + height + '.');
		if (height > quickMessageMaxHeight) {
			height = quickMessageMaxHeight;
			elem.window.setPosition(workAreaSize.width - message_win_width - 16, elem.window.getPosition()[1]);
			elem.window.setSize(message_win_width + 16, elem.window.getSize()[1]);
		}
		elem.window.setSize(elem.window.getSize()[0], Math.round(height));
		var resizeAnim = animate(
			originalHeight,
			height,
			300,
			(val) => {
				try {
					elem.window.setPosition(elem.window.getPosition()[0], workAreaSize.height - Math.round(val) - calculateWinHeights(index));
					displayingMessages.forEach((elem2, dex) => {
						if (dex > index) {
							elem2.window.setPosition(elem2.window.getPosition()[0], workAreaSize.height - Math.round(val) - calculateWinHeights(dex));
						}
					});
				}
				catch (e) {
					console.log('Error on resize animation. Clearning animation interval.');
					clearInterval(resizeAnim);
				}
			},
			(x, dur) => {
				return Math.pow((0.003 * (1000 / dur) * x) + 1, -3);
			}
		);
	});
});

ipc.on('apiSend', (event, msg) => {
	displayingMessages.filter((elem) => elem.window.webContents == event.sender.webContents).forEach((elem, index) => {
		console.log('Sending api message.');
		elem.api.sendMessage(msg.body, msg.thread, (err, msgInfo) => {
			event.sender.send('apiSendCallback', err, msgInfo);
		});
	});
});

app.on('window-all-closed', () => { });