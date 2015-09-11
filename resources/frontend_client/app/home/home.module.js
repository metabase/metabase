'use strict';

var Home = angular.module('metabase.home', [
    'metabase.home.controllers',
]);

Home.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/', {
        template:   '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: 'Homepage',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
