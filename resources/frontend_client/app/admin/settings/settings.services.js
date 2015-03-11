'use strict';

var SettingsAdminServices = angular.module('corvusadmin.settings.services', ['ngResource', 'ngCookies']);

SettingsAdminServices.factory('SettingsAdminServices', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/setting', {}, {
        list: {
            url: '/api/setting?org=:org',
            method: 'GET',
            isArray: true
        },

        // POST endpoint handles create + update in this case
        save: {
            url: '/api/setting',
            method: 'POST'
        },

        delete: {
            url: '/api/setting/:key?org=:org',
            method: 'DELETE'
        }
    });
}]);