import "metabase/directives";
import "metabase/services";
import "./dashboard.controllers";

// Dashboard
var Dashboard = angular.module('metabase.dashboard', [
    'ngRoute',
    'metabase.directives',
    'metabase.services',
    'metabase.dashboard.controllers'
]);

Dashboard.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/dash/:dashId', {
        template: '<div mb-redux-component />',
        controller: 'Dashboard',
        reloadOnSearch: false
    });
}]);
