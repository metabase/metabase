"use strict";

var UserAdmin = angular.module('metabase.user', [
    'ngRoute',
    'ngCookies',
    'metabase.filters',
    'metabase.directives',
    'metabase.services',
    'metabase.metabase.services',
    'metabase.user.controllers',
    'metabase.user.directives'
]);

UserAdmin.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/user/edit_current', {
        templateUrl: '/app/user/partials/edit_current_user.html',
        controller: 'EditCurrentUser'
    });
}]);
