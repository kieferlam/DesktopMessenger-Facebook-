"use strict";

const electron = require('electron');

//globalShortcut for global keyboard events for testing
const { app, BrowserWindow, Tray, Menu, MenuItem, dialog, globalShortcut, nativeImage } = electron;

//Error handling
process.on('uncaughtException', (err) => {
	console.log(err);
	app.quit();
});

const url = require('url');
const path = require('path');
const fs = require('fs');
const request = require('request');
const appPackage = require('./package.json');
const spawn = require('child_process').spawn;
const graph = require('./graph.js');

const message_win_width = 360;

const os = require('os');
const isLinux = os.platform == 'linux';
const isWindows = os.platform == 'win32';
const isMac = os.platform == 'darwin';

//TURN THIS OFF FOR DEPLOY
const DEBUG_LOCAL_MODE = false;
global.DEBUG_LOCAL_MODE = DEBUG_LOCAL_MODE;

var ipc = electron.ipcMain;

global.settings = {
	autoUpdate: true,
	message_display_period: 5000,
	quickMessagesAllowMuted: false,
	trayContextMenuRecentThreadsAmount: 8,
};

global.package = appPackage;

const APP_DATA_PATH = app.getPath('userData');

const appstateFile = APP_DATA_PATH + '/appstate.json';
const settingsFile = APP_DATA_PATH + '/prefs.json';

var login = require('facebook-chat-api');
var loggedIn = false;
var facebook = null;

var displayingMessages = [];

var preloadedThreads = [];
const preloadThreadAmount = 10;
var preloadedThreadsIndex = 0;

const CONVERSATION_LOAD_AMOUNT = 10;

var currentUserID;
var currentUserInfo;

var preloadedUserInfo = {};

var workAreaSize = {};
var quickMessageMaxHeight;

var conversations = [];

var settingsWindow = null;
var profileWindow = null;

var forceQuit = false;

var muted = false;

function fb(callback) {
	if (facebook != null && facebook != undefined) {
		callback(facebook);
	} else {
		console.log('Facebook API is null.');
	}
}

let tray = null;
var contextMenu;
const muteMenuItems = [{ label: '10 minutes', type: 'checkbox', click: (menuitem, browser, event) => mute(menuitem, 1000 * 60 * 10) },
{ label: '30 minutes', type: 'checkbox', click: (menuitem, browser, event) => mute(menuitem, 1000 * 60 * 30) },
{ label: '1 hour', type: 'checkbox', click: (menuitem, browser, event) => mute(menuitem, 1000 * 60 * 60) },
{ label: '2 hour', type: 'checkbox', click: (menuitem, browser, event) => mute(menuitem, 1000 * 60 * 60 * 2) },
{ label: '6 hour', type: 'checkbox', click: (menuitem, browser, event) => mute(menuitem, 1000 * 60 * 60 * 6) }];
const muteMenu = Menu.buildFromTemplate(muteMenuItems);
var currentMute;
function makeTrayIcon(api) {
	tray = new Tray(path.join(__dirname, '/img/ico24.png'));
	contextMenu = Menu.buildFromTemplate([
		{ label: 'Mute for', type: 'submenu', submenu: muteMenu },
		{ type: 'separator' },
		{ label: 'Friends', type: 'normal', click: (menuitem, browser, event) => showProfileWindow(event, api, 'Friends') },
		{ label: 'Messages', type: 'normal', click: (menuitem, browser, event) => showProfileWindow(event, api, 'Messages') },
		{ type: 'separator' },
		{ label: 'Settings', type: 'normal', click: () => showSettingsWindow() },
		{ type: 'separator' },
		{
			label: 'Logout', type: 'normal', click: () => {
				forceQuit = true;
				saveSettings();
				if (!DEBUG_LOCAL_MODE) api.logout(() => app.quit());
			}
		},
		{
			label: 'Quit', type: 'normal', click: () => {
				//Quit pressed
				forceQuit = true;
				saveSettings();
				app.quit();
			}
		}
	])
	tray.setToolTip(appPackage.name)
	tray.setContextMenu(contextMenu)

}

function mute(menuitem, time) {
	currentMute = menuitem;
	muted = true;
	muteMenu.items.filter((item, index) => item != menuitem).forEach((item, index) => item.checked = false);
	setTimeout(() => {
		if (currentMute != menuitem) return;
		muted = false;
		currentMute = null;
		muteMenu.items.filter((item, index) => item == menuitem).forEach((item, index) => item.checked = false);
	}, time);
}

function showSettingsWindow() {
	console.log('Show settings window request.');
	if (settingsWindow != null) {
		//Show window to move it to the front.
		settingsWindow.show();
		return console.log('Settings window is not null.');
	}

	settingsWindow = new BrowserWindow({
		width: 480,
		height: 560,
		frame: true,
		transparent: false,
		show: true,
		icon: './img/ico24.png',
		alwaysOnTop: false,
		skipTaskbar: false,
		autoHideMenuBar: true
	});

	settingsWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'settings.html'),
		protocol: 'file',
		slashes: true
	}));

	/**
	 * I decided not to keep the settings window alive and hidden when `closed` (like the profile window) because the settings window is not opened/closed enough for the quickness. Instead, the window will be destroyed and save about 20MB RAM.
	 */
	settingsWindow.on('closed', (event) => {
		console.log('Settings window closed.');
		saveSettings();
		settingsWindow = null;
	});
}

function loadSettings() {
	console.log('Loading settings...');
	if (fs.existsSync(settingsFile)) {
		var loadedSettings = JSON.parse(fs.readFileSync(settingsFile));
		for (var prop in loadedSettings) {
			global.settings[prop] = loadedSettings[prop];
		}
		console.log('Loaded settings.');
	} else {
		console.log('Settings file doesn\'t exist.');
	}
}

function saveSettings() {
	console.log('Saving settings...');
	fs.writeFileSync(settingsFile, JSON.stringify(global.settings));
	console.log('Saved settings.');
}

function showProfileWindow(event, api, defaultTab) {
	console.log('Show profile window request. Tab: ' + defaultTab);
	//If control is pressed, reload the window
	if (event.ctrlKey && profileWindow != null) {
		profileWindow.close();
		profileWindow = null;
	}

	if (profileWindow != null) {
		profileWindow.webContents.send('requestDisplayTab', defaultTab);
		profileWindow.show();
		return console.log('Profile window is not null.');
	}

	profileWindow = new BrowserWindow({
		width: 360,
		height: 600,
		frame: true,
		transparent: false,
		show: false,
		icon: './img/ico24.png',
		alwaysOnTop: false,
		skipTaskbar: false,
		autoHideMenuBar: true
	});

	profileWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'profile.html'),
		protocol: 'file',
		slashes: true
	}));

	profileWindow.on('close', (event) => {
		if (!forceQuit) {
			event.preventDefault();
			profileWindow.hide();
			return console.log('Profile window hidden.');
		}
		profileWindow = null;
	}
	);

	ipc.once('profileDomLoaded', (event) => {
		console.log('Profile window DOM loaded.');
		try {
			//Load facebook data
			var facebookData = {};
			facebookData.messageThreads = preloadedThreads.slice();

			api.getFriendsList((err, data) => {
				if (err) return console.error(err);
				facebookData.friendsList = data;
				facebookData.participantInfo = preloadedUserInfo;

				//Send facebook data to profile process
				event.sender.send('loadFacebookData', facebookData, defaultTab);

			});

		} catch (e) {
			console.error(e);
			profileWindow = null;
		}
	});

	ipc.once('facebookDataLoaded', (event) => {
		console.log('Profile Facebook data loaded.');
		profileWindow.show();
	});

	ipc.on('preloadMoreThreads', (event) => {
		console.log('Load more threads request.');
		loadNextThreads((threads) => {
			var threadSendPackage = { messageThreads: threads };
			loadRelevantUserInfo(api, threads, (userData) => {
				threadSendPackage.participantInfo = preloadedUserInfo;
				event.sender.send('loadMoreThreads', threadSendPackage);
				console.log('Loaded more threads.');
			})
		});
	});
}

var openThreadFunction = (event, threadID) => {
	console.log('Open thread request. Thread ID: ' + threadID);

	//Check if conversation is already open
	var alreadyOpen = false;
	conversations.forEach((conv, index) => {
		if (conv.threadID == threadID) {
			console.log('Conversation[' + threadID + '] is already open.');
			conv.window.show();
			alreadyOpen = true;
			return;
		}
	});
	if (alreadyOpen) return;

	//Continue if no conversation exists with this threadID
	console.log('No conversation with threadID ' + threadID);

	var conversation = {
		threadID: threadID,
		lastMessageTimestamp: Date.now()
	};
	conversation.id = 'Conversation[' + conversation.threadID + ']';

	conversation.window = new BrowserWindow({
		show: false,
		width: 360,
		height: 480,
		autoHideMenuBar: true,
		icon: './img/ico24.png'
	});

	//Defining conversation history
	conversation.history = [];

	//Append conversation to conversation list
	conversations.push(conversation);

	//Load the page
	conversation.window.loadURL(url.format({
		pathname: path.join(__dirname, 'conversation.html'),
		protocol: 'file',
		slashes: true
	}));

	//Remove conversation from the list when closed
	conversation.window.on('closed', (event) => {
		console.log(conversation.id + ' closed.');
		conversations.splice(conversations.indexOf(conversation), 1);
	});

	//Send conversation data when DOM is loaded
	ipc.once('conversation_DOM_loaded', (event) => {
		console.log(conversation.id + ' DOM loaded.');
		//Check if thread exists in preloaded threads
		var threadIndex = -1;
		preloadedThreads.forEach((thread, index) => {
			if (thread.threadID == conversation.threadID) {
				threadIndex = index;
				return;
			}
		});

		if (threadIndex < 0) {
			console.log(conversation.id + ' thread is not loaded.');
			fb((api) => {
				api.getThreadInfo(conversation.threadID, (err, thread) => {
					if (err) return console.log(err);
					preloadedThreads.push(thread);

					//Load users
					var unloadedUserIDs = thread.participantIDs.filter((id) => preloadedUserInfo[id] == undefined);
					if (unloadedUserIDs.length > 0) {
						//Load user infos then send
						api.getUserInfo(unloadedUserIDs, (err, users) => {
							preloadedUserInfo = collect(preloadedUserInfo, users);
							//Send thread info
							event.sender.send('receive_thread', { thread: thread, userID: currentUserID, userInfos: preloadedUserInfo });
							//Load thread history
							loadMessagesSync(event, conversation);
						});
					} else {
						//Send thread info
						event.sender.send('receive_thread', { thread: thread, userID: currentUserID, userInfos: preloadedUserInfo });
						//Load thread history
						loadMessagesSync(event, conversation);
					}
				});
			});
		} else {
			console.log(conversation.id + ' thread is already loaded.');
			var thread = preloadedThreads[threadIndex];
			//Send thread info
			event.sender.send('receive_thread', { thread: thread, userID: currentUserID, userInfos: preloadedUserInfo });
			//Load thread history
			loadMessagesSync(event, conversation);
		}
	});

	ipc.on('conversation_request_messages_sync', (event) => {
		loadMessagesSync(event, conversation);
	});

	//Display when ready
	ipc.once('conversation_show', (event) => {
		console.log('Showing Conversation[' + conversation.threadID + ']');
		conversation.window.show();
	});

};

ipc.on('openThread', openThreadFunction);

ipc.on('conversation_send_message_async', (event, threadID, body, msgID) => {
	fb((api) => {
		api.sendMessage(body, threadID, (err, msgInfo) => {
			event.sender.send('conversation_message_sent_async', err, { info: msgInfo, id: msgID });
		});
	});
});

ipc.on('conversation_request_messages_async', (event, threadID) => {
	conversations.forEach((conv, index) => {
		if (conv.threadID == threadID) {
			fb((api) => {
				console.log('Performing API getThreadHistory ASYNC on ' + conv.id + ' timestamp[' + conv.lastMessageTimestamp + ']');
				api.getThreadHistory(threadID, CONVERSATION_LOAD_AMOUNT, conv.lastMessageTimestamp, (err, history) => {
					if (err) return console.log(err);
					console.log(conv.id + ' history loaded.');
					//Discard latest message as it's a duplicate
					history.pop();
					//Append history to conversation
					history.forEach((msg, index) => {
						conv.history.push(msg);
					});
					//Set last message time 
					conv.lastMessageTimestamp = history.length > 0 ? history[0].timestamp : conv.lastMessageTimestamp;
					//Send history to conversation process
					conv.window.webContents.send('receive_history', history);
				});
			});
		}
	});
});

function loadMessagesSync(event, conversation) {
	fb((api) => {
		console.log('Performing API getThreadHistory ASYNC on ' + conversation.id + ' timestamp[' + conversation.lastMessageTimestamp + ']');
		api.getThreadHistory(conversation.threadID, CONVERSATION_LOAD_AMOUNT, conversation.lastMessageTimestamp, (err, history) => {
			if (err) return console.log(err);
			console.log(conversation.id + ' history loaded.');
			//Append history to conversation
			history.forEach((msg, index) => {
				conversation.history.push(msg);
			});
			conversation.lastMessageTimestamp = history.length > 0 ? history[0].timestamp : conversation.lastMessageTimestamp;
			//Send history to conversation process
			if (event != undefined && event != null) {
				event.sender.send('receive_history', history);
			} else if (conversation != null && conversation != undefined) {
				if (conversation.window.webContents != null && conversation.window.webContents != undefined) {
					conversation.window.webContents.send('receive_history', history);
				}
			}
		});
	});
}

function checkForUpdates(callback) {
	console.log('Checking for updates...');
	request('https://raw.githubusercontent.com/mangopearapples/DesktopMessenger/master/release/LATEST_VERSION', (error, response, data) => {
		try {
			var curr_ver_int = parseInt(appPackage.version.replace(/\./g, ''));
			var latest_ver_int = parseInt(data.replace(/\./g, ''));
			if (latest_ver_int > curr_ver_int) {
				console.log('New update found.');
				dialog.showMessageBox({
					title: 'Update',
					type: 'question',
					message: 'There is a new update for ' + appPackage.name + '. Do you want to update?',
					buttons: ['No', 'Yes']
				}, (response) => {
					if (response == 0) {
						//No, don't do the update
						console.log('Skipping update.')
						callback();
					} else {
						//Yes, do update!
						console.log('Running update process...');
						var child_proc = spawn(app.getPath('exe'), ['updater.asar'], {
							detached: true,
							stdio: ['ignore', 'ignore', 'ignore']
						});
						child_proc.unref();
						app.quit();
					}
				});
			} else {
				callback();
			}
		} catch (e) {
			console.log(e);
			callback();
		}
	});
}

app.on('ready', () => {
	console.log(appPackage.name + ' ver. ' + appPackage.version);
	checkForUpdates(() => {
		loadSettings();
		if (DEBUG_LOCAL_MODE) {
			const debugMsg1 = globalShortcut.register('CmdOrCtrl+M', () => {
				handleMessage(null, {
					senderID: 'TestID',
					body: 'It\'s a figure of speech, Morty.',
					threadID: 'TestThreadID',
					messageID: 'TestMsgID',
					attachments: [],
					isGroup: false
				});
			});
			const debugMsg2 = globalShortcut.register('CmdOrCtrl+L', () => {
				handleMessage(null, {
					senderID: 'TestID',
					body: 'They\'re bureaucrats, I don\'t respect them.',
					threadID: 'TestThreadID',
					messageID: 'TestMsgID2',
					attachments: [],
					isGroup: false
				});
			});
			const debugMsg3 = globalShortcut.register('CmdOrCtrl+H', () => {
				handleMessage(null, {
					senderID: 'TestID',
					body: 'Keep shooting them, Morty.',
					threadID: 'TestThreadID',
					messageID: 'TestMsgID3',
					attachments: [],
					isGroup: false
				});
			});
		}
		runLogin(true);
	});

});

app.on('before-quit', () => {
	globalShortcut.unregisterAll();
});

function runApi(api) {
}

var login_fail_retry_count = 0;
function runLogin(useAppState) {

	if (DEBUG_LOCAL_MODE) {
		console.log('Debug mode. Skipping login.');
		loginSuccess(null);
	} else {
		if (useAppState) {
			try {
				login({ appState: JSON.parse(fs.readFileSync(appstateFile, 'utf8')) }, (err, api) => {
					if (err) {
						console.log('Appstate login error.');
						console.error(err);
						if (login_fail_retry_count >= 10) {
							runLogin(false);
						} else {
							console.log('Retrying login...');
							setTimeout(() => runLogin(useAppState, ++login_fail_retry_count), 3000);
						}

					} else {
						facebook = api;
						runApi(api);
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
		event.sender.send('setLastLogin', settings.lastLoginEmail);
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
			settings.lastLoginEmail = data.email;
			console.log('Login success!');

			fs.writeFileSync(appstateFile, JSON.stringify(api.getAppState()));

			event.sender.send('loginSuccess');

			setTimeout(() => {
				loginSuccess(api);
				loginWin.close();
			}, 3000);

		});
	});
}

function loadRelevantUserInfo(api, threads, callback) {
	var userIDs = [];

	//This is to just concat all participant IDs regardless of whether the user has been loaded or not
	var bigUserIDs = [];
	threads.forEach((elem, index) => {
		bigUserIDs = bigUserIDs.concat(elem.participantIDs);
	});

	for (var i = 0; i < bigUserIDs.length; ++i) {
		if (preloadedUserInfo[bigUserIDs[i]] == undefined && userIDs.indexOf(bigUserIDs[i]) == -1) {
			userIDs.push(bigUserIDs[i]);
		}
	}

	if (userIDs.length == 0) {
		return callback({});
	}

	return api.getUserInfo(userIDs, (err, userData) => {
		if (err) return console.error(err);
		preloadedUserInfo = collect(preloadedUserInfo, userData);
		if (callback != undefined && callback != null) {
			return callback(userData);
		}
	});

}

function loadNextThreads(callback) {
	fb((api) => {
		api.getThreadList(preloadedThreadsIndex, preloadedThreadsIndex + preloadThreadAmount, (err, arr) => {
			try {
				arr.forEach((elem) => preloadedThreads.push(elem));
				if (callback != undefined && callback != null) callback(arr);
			} catch (e) {
				console.error(e);
			} finally {
				preloadedThreadsIndex += preloadThreadAmount;
			}
		});
	});
}

function setTrayRecentThreads(threads) {
	console.log('Setting recent threads in tray context menu...');
	if (!Array.isArray(threads)) return;
	console.log('Recent threads [' + threads.length + ']');
	contextMenu.insert(0, new MenuItem({ type: 'separator' }));
	for (var i = 0; i < Math.min(global.settings.trayContextMenuRecentThreadsAmount, threads.length); ++i) {
		const userInfo = preloadedUserInfo[threads[i].participantIDs[0]];
		const iconSrc = threads[i].isCanonicalUser ? userInfo.thumbSrc : threads[i].imageSrc;
		const name = threads[i].isCanonicalUser ? userInfo.name : threads[i].name;
		const thread = threads[i];
		if (iconSrc != null) {
			loadUrlToNativeImage(iconSrc, (error, img) => {
				var menuitem = new MenuItem({ label: name, icon: img.resize({ width: 24, height: 24 }), click: (menuitem, browser, event) => openThreadFunction(event, thread.threadID) });
				contextMenu.insert(0, menuitem);
			});
		} else {
			var menuitem = new MenuItem({ label: name, click: (menuitem, browser, event) => openThreadFunction(event, thread.threadID) });
			contextMenu.insert(0, menuitem);
		}
	}
}

function loginSuccess(api) {
	const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
	workAreaSize = { width: width, height: height };
	quickMessageMaxHeight = Math.floor(workAreaSize.height * (1.0 / 3.0));
	loggedIn = true;
	currentUserID = DEBUG_LOCAL_MODE ? 0 : api.getCurrentUserID();
	makeTrayIcon(api);

	if (!DEBUG_LOCAL_MODE) {

		//Preload thread data
		console.log('Loading ' + preloadThreadAmount + ' threads.');
		loadNextThreads((arr) => {
			console.log('Loaded ' + preloadedThreads.length + ' threads.');

			console.log('Loading user info.');
			loadRelevantUserInfo(api, arr, (userData) => {
				currentUserInfo = userData[currentUserID];
				preloadedUserInfo = collect(preloadedUserInfo, userData);
				console.log('Loaded user info.');

				setTrayRecentThreads(arr);
			});

			api.listen((err, message) => {
				if (err) return console.error(err);
				if (message.type == 'message') {
					handleMessage(api, message);
				}
			});
		});
	}
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

function handleQuickMessage(api, message, threadData) {
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
			if (autoCloseRunning) return;
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

		newWin.restartCloseTimer = function () {
			clearTimeout(newWin.autoCloseTimeout);
			if (global.settings.message_display_period > 0) {
				newWin.autoCloseTimeout = setTimeout(animateCloseFunction, global.settings.message_display_period);
			}
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
				event.sender.send('initMessageDetails', threadData, userInfo, preloadedUserInfo);
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
						() => {
							newWin.slideInAnim = 0;
							newWin.restartCloseTimer();
						}
					);
				}
			} catch (e) {
				console.error(e);
			}
		});

		newWin.once('close', () => {
			autoCloseRunning = false;
			console.log('Message window (' + displayingMessages.indexOf(msgWinObj) + ') closed.');
			displayingMessages.splice(displayingMessages.indexOf(msgWinObj), 1);
		});

		console.log('Finished setting up.');
	}
}

function handleMessage(api, message) {
	console.log("New message from " + message.senderID + ": " + message.body);

	var conversationExists = false;
	conversations.filter((conv) => conv.threadID == message.threadID).forEach((conv, index) => {
		conv.window.webContents.send('receive_message', message);
		if (!conv.window.isFocused()) conv.window.flashFrame(true);
		conversationExists = true;
	});


	if (!conversationExists && !muted) {
		api.getThreadInfo(message.threadID, (err, threadData) => {
			if (err) return console.error(err);
			loadRelevantUserInfo(api, [threadData], (newUserInfo) => {
				//Facebooks mute until time is seconds since epoch (NOT MILLIS)
				if ((threadData.muteUntil == -1 || Date.now() < threadData.muteUntil * 1000) && !global.settings.quickMessagesAllowMuted) {
					console.log('Thread is muted.');
					return;
				}
				handleQuickMessage(api, message, threadData);
			});
		});

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

/*
	PROFILE FRIENDS LIST IPC FUNCTIONS
*/

ipc.on('request_profile_picture_load', (event, data) => {
	if (Array.isArray(data.friends)) {
		data.friends.filter((friend) => friend.userID != 0).forEach((friend, index) => {
			graph.getProfilePictureURL(friend.userID, 256, (error, data) => {
				if (error) return console.log(`Couldn't load profile picture for user ${friend.userID}`);
				event.sender.send('profile_picture_loaded', { data: data.data, uid: friend.userID, isFriend: true, isThread: false });
			});
		});
	}
	if (Array.isArray(data.threads)) {
		data.threads.filter((thread) => (thread.isCanonicalUser && thread.threadID != 0)).forEach((thread, index) => {
			graph.getProfilePictureURL(thread.threadID, 256, (error, data) => {
				if (error) return console.log(`Couldn't load profile picture for thread ${thread.threadID}`);
				event.sender.send('profile_picture_loaded', { data: data.data, threadID: thread.threadID, isThread: true, isFriend: false });
			});
		});
	}
});

/*
	CONVERSATION IPC FUNCTIONS
*/

ipc.on('conversation_set_title', (event, data) => {
	console.log('Setting conversation title of thread ' + data.thread.threadID + ' to ' + data.title);
	var conversation = conversations.find((conv, index) => conv.threadID == data.thread.threadID);
	if (conversation != undefined) {
		conversation.window.setTitle(data.title);
	}
});

ipc.on('conversation_set_icon', (event, data) => {
	console.log('Setting conversation icon of thread ' + data.thread.threadID + ' to ' + data.iconSrc);
	var conversation = conversations.find((conv, index) => conv.threadID == data.thread.threadID);
	if (conversation != undefined) {
		if (data.iconSrc != undefined && data.iconSrc != null) {
			request({ url: data.iconSrc, encoding: null }, (error, response, body) => {
				if (response.statusCode == 200) {
					conversation.window.setIcon(nativeImage.createFromBuffer(body));
				} else {
					console.log('Couldn\'t load icon at ' + data.iconSrc);
					if (data.icon != undefined && data.icon != null) {
						conversation.window.setIcon(data.icon);
					}
				}
			});
		} else if (data.icon != undefined && data.icon != null) {
			conversation.window.setIcon(data.icon);
		}
	}
});

/*
	MISCELLANOUS FUNCTIONS
*/

function loadUrlToNativeImage(url, callback) {
	request({ url: url, encoding: null }, (error, response, body) => {
		if (response.statusCode == 200) {
			callback(null, nativeImage.createFromBuffer(body));
		} else {
			console.log('Couldn\'t load image at ' + url);
			callback(error);
		}
	});
}

function collect() {
	var ret = {};
	var len = arguments.length;
	for (var i = 0; i < len; i++) {
		for (var p in arguments[i]) {
			if (arguments[i].hasOwnProperty(p)) {
				ret[p] = arguments[i][p];
			}
		}
	}
	return ret;
}

app.on('window-all-closed', () => { });