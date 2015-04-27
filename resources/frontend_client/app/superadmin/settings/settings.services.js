'use strict';

var SettingsAdminServices = angular.module('superadmin.settings.services', ['ngResource']);

SettingsAdminServices.factory('SettingsAdminServices', ['$resource', function($resource) {
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
