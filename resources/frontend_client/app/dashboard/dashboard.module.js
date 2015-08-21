'use strict';

// Dashboard
var Dashboard = angular.module('corvus.dashboard', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.dashboard.services',
    'corvus.dashboard.controllers',
    'corvus.dashboard.directives',
    'corvus.card.services'
]);

Dashboard.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/dash/:dashId', {
        template: '<div mb-redux-component />',
        controller: 'Dashboard'
    });
    $routeProvider.when('/dash_old/:dashId', {
        templateUrl: '/app/dashboard/partials/dash_view.html',
        controller: 'DashDetail'
    });
}]);
