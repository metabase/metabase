'use strict';

var Setup = angular.module('metabase.setup', ['metabase.setup.controllers']);

Setup.config(['$routeProvider', function($routeProvider) {

    $routeProvider.when('/setup/', {
        templateUrl: '/app/setup/partials/setup_info.html',
        controller: 'SetupInfo',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
