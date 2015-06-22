"use strict";

var UserAdmin = angular.module('corvus.user', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.metabase.services',
    'corvus.user.controllers',
    'corvus.user.directives'
]);

UserAdmin.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/user/edit_current', {
        templateUrl: '/app/user/partials/edit_current_user.html',
        controller: 'EditCurrentUser'
    });
}]);
