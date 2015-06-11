'use strict';

var Home = angular.module('corvus.home', [
    'corvus.home.controllers',
]);

Home.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {
        templateUrl: '/app/home/home.html',
        controller: 'Home',
        resolve: {
            appState: function(AppState) {
                return AppState.init();
            }
        }
    });
}]);
