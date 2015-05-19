'use strict';

var Setup = angular.module('corvus.setup', [
    'corvus.setup.controllers',
    'corvus.setup.directives'
]);

Setup.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/setup/welcome', {
        templateUrl: '/app/setup/partials/setup_welcome.html'
    });

    $routeProvider.when('/setup/info', {
        templateUrl: '/app/setup/partials/setup_info.html',
        controller: 'SetupInfo'
    });
}]);
