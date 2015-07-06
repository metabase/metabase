'use strict';
/* global gapi, console, Promise */
let CLIENT_ID = '854473542841-plbv7pq13m1hglc51bis5egvddkftb1n.apps.googleusercontent.com';

// auth scope
let SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly'
];


let GA = {
    authorize: function (event) {
        console.log('event?', event)
        // this will be false when invoked from the button
        var useImmediate = event ? false : true;

        // auth request object
        var authData = {
            client_id: CLIENT_ID,
            scope: SCOPES,
            immediate: useImmediate
        };

        return new Promise(function (resolve, reject) {
            gapi.auth.authorize(authData, function (response) {
                console.log('response', response)
                // if there's a response error make sure the button is visible
                if(!response.error) {
                    resolve(response);
                } else {
                    reject(new Error('could not authorize with GA'));
                }
            });
        });
    },

    queryAccounts: function () {

    // ACCOUNT QUERY & HANDLER
    // ---------------------------------
    // query ga accounts
        return new Promise(function (resolve, reject) {
            gapi.client.load('analytics', 'v3').then(function () {
                gapi.client.analytics.management.accounts.list().then(function (response) {
                    if(response.result.items && response.result.items.length) {
                        resolve(response.result);
                    } else {
                        reject(new Error('problemo'));
                    }
                });
            });
        });
    },
    queryProperties: function(accountId) {
        // WEB PROPERTIES QUERY & HANDLER
        // ---------------------------------
        console.log('accountId');
        // get account properties for an account id
        return new Promise(function (resolve, reject) {
            gapi.client.analytics.management.webproperties.list({
                'accountId': accountId
            })
            .then(function (response) {
                if(response.result.items && response.result.items.length) {
                    resolve(response.result);
                } else {
                   reject(new Error('promlemo'));
                }
            })
            .then(null, function (err) {
                console.log(err);
            });

        });
    },

    // handleProperties: function (response) {
    //     // handles the response from the web proprties
    //
    //     console.log('properties response', response);
    //     if(response.result.items && response.result.items.length) {
    //         // get the first GA account id
    //         var firstAccountId = response.result.items[0].accountId;
    //         var firstPropertyId = response.result.items[0].id;
    //
    //         GA.queryProfiles(firstAccountId, firstPropertyId);
    //
    //     } else {
    //         console.log('No properties for this user');
    //     }
    // },
    //
    queryProfiles: function (accountId, propertyId) {
        return new Promise(function (resolve, reject) {
            gapi.client.analytics.management.profiles.list({
                'accountId': accountId,
                'webPropertyId': propertyId
            })
            .then(function (response) {
                if (response.result.items && response.result.items.length) {
                    resolve(response.result);
                } else {
                   reject(new Error('promlemo'));
                }
            })
            .then(null, function (err) {
               console.log(err);
            });

        });
    },

    columnList: function () {
        return new Promise(function (resolve, reject) {
            gapi.client.analytics.metadata.columns.list({
                'reportType': 'ga'
            }).then(function (response) {
                if(response.result.items && response.result.items.length) {
                    var metrics = [],
                        dimensions = [];

                    // split out metrics and dimensions
                    var columns = response.result.items;
                    for(var c in columns) {
                        if(columns[c].attributes.type === "METRIC") {
                            metrics.push(columns[c]);
                        } else if (columns[c].attributes.type === "DIMENSION") {
                            dimensions.push(columns[c]);
                        }
                    }
                    resolve({
                        metrics: metrics,
                        dimensions: dimensions,
                    });

                }
            })
            .then(null, function (err) {
               reject(new Error(err));
           });
       });
    },


    queryCoreReportingApi: function (query) {
        return new Promise(function (resolve, reject) {
            gapi.client.analytics.data.ga
            .get(query)
            .then(function (response) {
                console.log(response);
                resolve(response);
            })
            .then(null, function (err) {
                reject(new Error(err));
            });
        });
    }

};

export default GA;
