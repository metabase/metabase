'use strict';

// Dashboard
var Dashboard = angular.module('corvus.dashboard', [
    'ngRoute',
    'corvus.directives',
    'corvus.services',
    'corvus.dashboard.services',
    'corvus.dashboard.controllers',
    'corvus.dashboard.directives',
    'corvus.card.services'
]);

Dashboard.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/dash/:dashId', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: 'Dashboard'
    });
}]);
