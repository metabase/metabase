'use strict';

var AdminDatabases = angular.module('corvusadmin.databases', [
    'corvusadmin.databases.controllers'
]);

AdminDatabases.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/databases', {
        templateUrl: '/app/admin/databases/partials/database_list.html',
        controller: 'DatabaseList'
    });
    $routeProvider.when('/admin/databases/create', {
        templateUrl: '/app/admin/databases/partials/database_edit.html',
        controller: 'DatabaseEdit'
    });
    $routeProvider.when('/admin/databases/:databaseId', {
        templateUrl: '/app/admin/databases/partials/database_edit.html',
        controller: 'DatabaseEdit'
    });
}]);
