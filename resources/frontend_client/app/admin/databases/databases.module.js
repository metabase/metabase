'use strict';

var AdminDatabases = angular.module('corvusadmin.databases', [
    'corvusadmin.databases.controllers'
]);

AdminDatabases.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/databases', {
        templateUrl: '/app/admin/databases/partials/database_list.html',
        controller: 'DatabaseList'
    });
    $routeProvider.when('/:orgSlug/admin/databases/create', {
        templateUrl: '/app/admin/databases/partials/database_edit.html',
        controller: 'DatabaseEdit'
    });

    $routeProvider.when('/:orgSlug/admin/databases/:databaseId', {
        redirectTo: '/:orgSlug/admin/databases/:databaseId/tables'
    });
    $routeProvider.when('/:orgSlug/admin/databases/:databaseId/:mode', {
        templateUrl: '/app/admin/databases/partials/database_master_detail.html',
        controller: 'DatabaseMasterDetail'
    });
    $routeProvider.when('/:orgSlug/admin/databases/:databaseId/:mode/:tableId', {
        templateUrl: '/app/admin/databases/partials/database_master_detail.html',
        controller: 'DatabaseMasterDetail'
    });

}]);
