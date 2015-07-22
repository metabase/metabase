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

    $routeProvider.when('/auth/forgot_password', {
        templateUrl: '/app/auth/partials/forgot_password.html',
        controller: 'ForgotPassword'
    });

    $routeProvider.when('/auth/reset_password/:token', {
        templateUrl: '/app/auth/partials/password_reset.html',
        controller: 'PasswordReset'
    });
}]);

Auth.service('AuthUtil', ['$rootScope', '$location', 'ipCookie', function($rootScope, $location, ipCookie) {

    this.setSession = function(sessionId) {
        // set a session cookie
        var isSecure = ($location.protocol() === "https") ? true : false;
        ipCookie('metabase.SESSION_ID', sessionId, {
            path: '/',
            expires: 14,
            secure: isSecure
        });

        // send a login notification event
        $rootScope.$broadcast('appstate:login', sessionId);
    };

}])