'use strict';

var AdminDatasets = angular.module('corvusadmin.datasets', [
    'corvusadmin.datasets.directives',
    'corvusadmin.datasets.controllers'
]);

AdminDatasets.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.otherwise({redirectTo: '/:orgSlug/admin/'});
    $routeProvider.when('/:orgSlug/admin/datasets', {
        templateUrl: '/app/admin/datasets/partials/dataset_list.html',
        controller: 'AdminDatasetList'
    });
    $routeProvider.when('/:orgSlug/admin/datasets/:tableId', {
        templateUrl: '/app/admin/datasets/partials/dataset_edit.html',
        controller: 'AdminDatasetEdit'
    });
    $routeProvider.when('/:orgSlug/admin/datasets/:tableId/dependents', {
        templateUrl: '/app/admin/datasets/partials/table_dependents.html',
        controller: 'AdminTableDependents'
    });
    $routeProvider.when('/:orgSlug/admin/datasets/field/:fieldId', {
        templateUrl: '/app/admin/datasets/partials/field_detail.html',
        controller: 'AdminFieldDetail'
    });
}]);
