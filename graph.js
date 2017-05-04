"use strict";

const request = require('request');

const protocol = 'http';
const graphURL = 'graph.facebook.com';

var collectParams = function (params) {
    var encoded_params = '';
    for (var key in params) {
        if (!params.hasOwnProperty(key)) continue;
        encoded_params += `${key}=${params[key]}&`;
    }
    return encoded_params.substring(0, encoded_params.length - 1);
}

var graphPictureURL = function (id, params) {
    return `${protocol}://${graphURL}/${id}/picture?${collectParams(params)}`;
}

var getGraphPictureURL = function (id, size) {
    return graphPictureURL(id, { width: size, height: size, redirect: false });
}

var getProfilePictureURL = function (id, size, callback) {
    if (!callback) throw { error: 'getProfilePictureURL needs a callback.' };
    request({ url: getGraphPictureURL(id, size)}, (error, response, body) => {
        if (response.statusCode == 200) {
            callback(null, JSON.parse(body));
        } else {
            callback("Reponse was not 200.");
        }
    });
}

module.exports = {
    getGraphPictureURL: getGraphPictureURL,
    getProfilePictureURL: getProfilePictureURL
};