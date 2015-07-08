'use strict';

var SettingsAdmin = angular.module('corvusadmin.settings', [
    'corvusadmin.settings.controllers',
    'corvusadmin.settings.services'
]);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/admin/settings/', {
        templateUrl: '/app/admin/settings/partials/settings.html',
        controller: 'SettingsAdminController'
    });
}]);
