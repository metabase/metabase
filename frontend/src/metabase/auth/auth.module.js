import "./auth.controllers";

var Auth = angular.module('metabase.auth', ['metabase.auth.controllers']);

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

    $routeProvider.when('/auth/password_reset_token_expired', {
        templateUrl: '/app/auth/partials/password_reset_token_expired.html'
    });
}]);
