'use strict';

var SearchAdmin = angular.module('corvusadmin.search', [
    'corvus.search.services',
    'corvusadmin.search.controllers'
]);

SearchAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/search/', {
        templateUrl: '/app/admin/search/partials/index.html',
        controller: 'SearchAdminHome'
    });
}]);