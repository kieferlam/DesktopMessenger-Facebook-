const electron = require('electron');

const remote = electron.remote;

var ipc = electron.ipcRenderer;

window.onerror = function (error, url, line) {
    log("Error at " + url + " on line " + line + ": " + error);
};

const $ = require('jquery');

var threadsRequested = false;

var selectedTab;

$(document).ready(() => {
    ipc.send('profileDomLoaded');

    $('#friends-tab-button').click((event) => {
        setDisplayTab('Friends');
    });

    $('#messages-tab-button').click((event) => {
        setDisplayTab('Messages');
    });

    $('#search-textfield').on('input', (event) => {
        filterFriends($('#search-textfield').val());
    });
});

function filterFriends(regex) {
    var search = regex.toLowerCase();
    $('.friend-div').each((index, element) => {
        var name = $(element).children('h1').text().toLowerCase();
        if (name.indexOf(search) > 0 || regex.length == 0) {
            $(element).removeClass('search-remove');
        } else {
            $(element).addClass('search-remove');
        }
    });
}

function friendsHTML(friend) {
    return `<div data-uid="${friend.userID}" class="friend-div"><img class="friend_profile-img" src="${friend.profilePicture}" /><h1>${friend.fullName}</h1><div class="friend_options-div"><img src="./img/ico_more_vert.png" class="friend_options-img" /></div></div>`;
}

function friendDblclickHandler(event) {
    var friendID = $(event.delegateTarget).attr('data-uid');
    ipc.send('openThread', friendID);
}

function appendFriendsData(facebookData) {
    facebookData.friendsList.forEach((friend, index) => {
        $('#friends_content-div').append(friendsHTML(friend));
    });
    $('.friend-div').dblclick(friendDblclickHandler);
}

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

    $('.messages-list-item').dblclick((clickEvent) => {
        var threadID = $(clickEvent.delegateTarget).attr('threadID');
        ipc.send('openThread', threadID);
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

ipc.on('requestDisplayTab', (event, tab) => {
    setDisplayTab(tab);
});

ipc.once('loadFacebookData', (event, facebookData, tab) => {
    log('Facebook data sent to profile window.');
    appendThreadData(facebookData);
    appendFriendsData(facebookData);

    setDisplayTab(tab);

    $('#tab-content-div').scroll((scrollEvent) => {
        if (!threadsRequested) {
            if ($('#tab-content-div').scrollTop() + $('#tab-content-div').innerHeight() >= $('#tab-content-div')[0].scrollHeight && selectedTab == 'Messages') {
                log('Profile window: Scroll reached bottom, requesting more threads.');
                threadsRequested = true;
                event.sender.send('preloadMoreThreads');
            }
        }
    });

    ipc.on('loadMoreThreads', (loadThreadsEvent, moreThreadData) => {
        log('Profile window: Received more threads.');
        appendThreadData(moreThreadData);
        threadsRequested = false;
    });

    event.sender.send('facebookDataLoaded');
});



function log(log) {
    ipc.send('console.log', log);
}