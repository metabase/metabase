'use strict';

var SuperAdminDatamarts = angular.module('superadmin.datamarts', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.components',
    'superadmin.datamarts.controllers',
    'superadmin.datamarts.services'
]);

SuperAdminDatamarts.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.otherwise({redirectTo: '/superadmin/'});
    $routeProvider.when('/superadmin/datamarts/', {
        templateUrl: '/app/superadmin/datamarts/partials/datamart_list.html',
        controller: 'DatamartList'
    });
    $routeProvider.when('/superadmin/datamarts/create', {
        templateUrl: '/app/superadmin/datamarts/partials/datamart_edit.html',
        controller: 'DatamartEdit'
    });
    $routeProvider.when('/superadmin/datamarts/:datamartId', {
        templateUrl: '/app/superadmin/datamarts/partials/datamart_edit.html',
        controller: 'DatamartEdit'
    });
}]);
