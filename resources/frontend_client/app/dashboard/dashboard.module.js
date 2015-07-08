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
    $routeProvider.when('/dash/:dashId', {templateUrl: '/app/dashboard/partials/dash_view.html', controller: 'DashDetail'});
    $routeProvider.when('/dash/:dashId/modify', {templateUrl: '/app/dashboard/partials/dash_modify.html', controller: 'DashDetail'});
}]);
