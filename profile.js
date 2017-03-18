const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

const $ = require('jquery');

var threadsRequested = false;

var selectedTab;

$(document).ready(() => {
    ipc.send('profileDomLoaded');
});

function messagesListItemHTML(data, userInfo) {
    var threadImageSrc = data.imageSrc;
    var threadTitle = data.name;
    if (data.isCanonicalUser && userInfo != null) {
        threadImageSrc = userInfo.thumbSrc;
        threadTitle = userInfo.name;
    }
    var messagePreview = data.snippet;

    var html = '<div class="messages-list-item" threadID="' + data.threadID + '"><img src="' + threadImageSrc + '" class="list-item-icon-image" alt="Profile Picture" /><div class="messages-list-item-text"><h2>' + threadTitle + '</h2><p>' + messagePreview + '</p></div><div class="messages-list-item-control"><button><img src="./img/ico_more_vert.png" alt="Options"></button></div></div>';
    return html;
}

function appendThreadData(data) {
    data.messageThreads.forEach((elem, index) => {
        var userInfo = null;
        if (elem.isCanonicalUser) {
            userInfo = data.participantInfo[elem.participantIDs[0]];
        }
        $('#messages-tab-div').append(messagesListItemHTML(elem, userInfo));
    });
}

function setDisplayTab(tab) {
    selectedTab = tab;
    switch (tab) {
        case 'Friends':
            $('#messages-tab-div').css({ display: 'none' });
            $('#friends-tab-div').css({ display: 'initial' });
            $('#friends-tab-button').addClass('selected-button');
            $('#messages-tab-button').removeClass('selected-button');
            $('#selected-tab-indicator').css({ left: "calc(15% - 10px)" });
            break;
        default:
        case 'Messages':
            $('#friends-tab-div').css({ display: 'none' });
            $('#messages-tab-div').css({ display: 'initial' });
            $('#messages-tab-button').addClass('selected-button');
            $('#friends-tab-button').removeClass('selected-button');
            $('#selected-tab-indicator').css({ left: "calc(45% - 10px)" });
            break;
    }
}

ipc.once('loadFacebookData', (event, threadData, tab) => {
    mainLog('Facebook data sent to profile window.');
    appendThreadData(threadData);

    setDisplayTab(tab);

    $('.messages-list-item').dblclick((clickEvent) => {
        var threadID = $(clickEvent.delegateTarget).attr('threadID');
        event.sender.send('openThread', threadID);
    });

    $('#tab-content-div').scroll((scrollEvent) => {
        if (!threadsRequested) {
            if ($('#tab-content-div').scrollTop() + $('#tab-content-div').innerHeight() >= $('#tab-content-div')[0].scrollHeight && selectedTab == 'Messages') {
                mainLog('Profile window: Scroll reached bottom, requesting more threads.');
                threadsRequested = true;
                event.sender.send('preloadMoreThreads');
            }
        }
    });

    ipc.on('loadMoreThreads', (loadThreadsEvent, moreThreadData) => {
        mainLog('Profile window: Received more threads.');
        appendThreadData(moreThreadData);
        threadsRequested = false;
    });

    event.sender.send('facebookDataLoaded');
});



$('#friends-tab-button').click((event) => {
    setDisplayTab('Friends');
});

$('#messages-tab-button').click((event) => {
    setDisplayTab('Messages');
});

function mainLog(log) {
    ipc.send('console.log', log);
}