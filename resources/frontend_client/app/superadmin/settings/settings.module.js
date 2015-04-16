'use strict';

var SettingsAdmin = angular.module('superadmin.settings', [
    'superadmin.settings.controllers',
    'superadmin.settings.services'
]);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/superadmin/settings/', {
        templateUrl: '/app/superadmin/settings/partials/settings.html',
        controller: 'SettingsAdminController'
    });
}]);
