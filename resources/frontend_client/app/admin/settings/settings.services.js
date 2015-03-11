'use strict';

var SettingsAdminServices = angular.module('corvusadmin.settings.services', ['ngResource', 'ngCookies']);

SettingsAdminServices.factory('SettingsAdminServices', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/setting', {}, {
        list: {
            url: '/api/setting',
            method: 'GET',
            isArray: true
        },

        // POST endpoint handles create + update in this case
        put: {
            url: '/api/setting/:key',
            method: 'PUT'
        },

        delete: {
            url: '/api/setting/:key',
            method: 'DELETE'
        }
    });
}]);