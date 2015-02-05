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
    $routeProvider.when('/:orgSlug/dash/', {templateUrl: '/app/dashboard/partials/dash_list.html', controller: 'DashList'});
    $routeProvider.when('/:orgSlug/dash/create', {templateUrl: '/app/dashboard/partials/dash_create.html', controller: 'DashDetail'});
    $routeProvider.when('/:orgSlug/dash/:dashId', {templateUrl: '/app/dashboard/partials/dash_view.html', controller: 'DashDetail'});
    $routeProvider.when('/:orgSlug/dash/:dashId/modify', {templateUrl: '/app/dashboard/partials/dash_modify.html', controller: 'DashDetail'});
    $routeProvider.when('/:orgSlug/dash/for_card/:cardId', {templateUrl: '/app/dashboard/partials/dash_list_for_card.html', controller: 'DashListForCard'});
}]);
