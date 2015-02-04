'use strict';

var Query = angular.module('corvusadmin.datasources', [
    'corvusadmin.datasources.services',
    'corvusadmin.datasources.controllers'
]);

Query.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/datasources/', {templateUrl: '/app/admin/datasources/partials/datasource_list.html', controller: 'DataSourceList'});
    $routeProvider.when('/:orgSlug/admin/datasources/create', {templateUrl: '/app/admin/datasources/partials/datasource_create.html', controller: 'DataSourceDetail'});
    $routeProvider.when('/:orgSlug/admin/datasources/:dataSourceId', {templateUrl: '/app/admin/datasources/partials/datasource_view.html', controller: 'DataSourceDetail'});
    $routeProvider.when('/:orgSlug/admin/datasources/:dataSourceId/modify', {templateUrl: '/app/admin/datasources/partials/datasource_modify.html', controller: 'DataSourceDetail'});
    $routeProvider.when('/:orgSlug/admin/datasource_ingestion/:dataSourceIngestionId', {templateUrl: '/app/admin/datasources/partials/datasource_ingestion_view.html', controller: 'DataSourceIngestionView'});
    $routeProvider.otherwise({redirectTo: '/:orgSlug/admin/'});
}]);
