'use strict';

var Query = angular.module('corvusadmin.query', [
    'corvus.aceeditor.directives',
    'corvusadmin.query.controllers'
]);

Query.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/query/', {
        templateUrl: '/app/admin/query/partials/query_list.html',
        controller: 'QueryList'
    });
    $routeProvider.when('/:orgSlug/admin/query/run', {
        templateUrl: '/app/admin/query/partials/query_run.html',
        controller: 'QueryRun'
    });
    $routeProvider.when('/:orgSlug/admin/query/:queryId', {
        templateUrl: '/app/admin/query/partials/query_view.html',
        controller: 'QueryView'
    });
    $routeProvider.when('/:orgSlug/admin/query/:queryId/modify', {
        templateUrl: '/app/admin/query/partials/query_modify.html',
        controller: 'QueryView'
    });
    $routeProvider.when('/:orgSlug/admin/query/:queryId/:resultId', {
        templateUrl: '/app/admin/query/partials/query_view_historical.html',
        controller: 'QueryView'
    });
}]);