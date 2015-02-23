'use strict';

var Auth = angular.module('corvus.auth', ['corvus.auth.controllers']);

Auth.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/auth/login', {
        templateUrl: '/app/auth/partials/login.html',
        controller: 'Login'
    });

    $routeProvider.when('/auth/logout', {
        template: '',
        controller: 'Logout'
    });

    $routeProvider.when('/auth/password_reset', {
        templateUrl: '/app/auth/partials/password_reset.html',
        controller: 'PasswordReset'
    });
}]);