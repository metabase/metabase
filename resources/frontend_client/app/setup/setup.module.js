'use strict';

var Setup = angular.module('metabase.setup', [
    'metabase.setup.controllers',
    'metabase.setup.directives'
]);

Setup.config(['$routeProvider', function($routeProvider) {

    $routeProvider.when('/setup/init/:setupToken', {
        template: '',
        controller: 'SetupInit'
    });

    $routeProvider.when('/setup/welcome', {
        templateUrl: '/app/setup/partials/setup_welcome.html'
    });

    $routeProvider.when('/setup/info', {
        templateUrl: '/app/setup/partials/setup_info.html',
        controller: 'SetupInfo'
    });
}]);
