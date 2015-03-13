'use strict';

var SettingsAdmin = angular.module('superadmin.index', [
    'superadmin.index.controllers',
    'superadmin.index.services'
]);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/superadmin/', {
        templateUrl: '/app/superadmin/index/partials/settings.html',
        controller: 'SettingsAdminController'
    });
}]);
