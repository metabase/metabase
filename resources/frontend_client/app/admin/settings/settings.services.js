'use strict';

var SettingsAdminServices = angular.module('corvusadmin.settings.services', ['ngResource', 'ngCookies']);

SettingsAdminServices.factory('SettingsAdminServices', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/settings', {}, {
        list: {
            url: '/api/settings',
            method: 'GET'
        },

        // POST endpoint handles create + update in this case
        save: {
            url: '/api/settings',
            method: 'POST'
        },

        delete: {
            url: '/api/settings/:name',
            method: 'DELETE'
        }
    });
}]);