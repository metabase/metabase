'use strict';

var Reserve = angular.module('corvus.reserve', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.metabase.services',
    'corvus.reserve.controllers',
    'corvus.reserve.services'
]);

Reserve.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/reserve/venue/', {templateUrl: '/app/reserve/partials/venue_list.html', controller: 'VenueList'});
    $routeProvider.when('/reserve/venue/:venueId', {templateUrl: '/app/reserve/partials/venue_detail.html', controller: 'VenueDetail'});

    $routeProvider.when('/reserve/user/', {templateUrl: '/app/reserve/partials/user_list.html', controller: 'UserList'});
    $routeProvider.when('/reserve/user/:userId', {templateUrl: '/app/reserve/partials/user_detail.html', controller: 'UserDetail'});
}]);
