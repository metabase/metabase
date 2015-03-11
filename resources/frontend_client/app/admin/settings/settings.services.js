'use strict';

var SettingsAdminServices = angular.module('corvusadmin.settings.services', ['ngResource', 'ngCookies']);

SettingsAdminServices.factory('SettingsAdminServices', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/settings', {}, {
        list: {
            url: '/api/settings?org=:org',
            method: 'GET',
            isArray: true
        },

        // POST endpoint handles create + update in this case
        save: {
            url: '/api/settings',
            method: 'POST'
        },

        delete: {
            url: '/api/settings/:key?org=:org',
            method: 'DELETE'
        }
    });
}]);