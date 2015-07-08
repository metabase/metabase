'use strict';

// Explore (Metabase)
var Explore = angular.module('corvus.explore', [
    'corvus.explore.controllers',
    'corvus.explore.services',
    'corvus.explore.directives'
]);

Explore.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/explore/', {templateUrl: '/app/explore/partials/database_list.html', controller: 'ExploreDatabaseList'});
    $routeProvider.when('/explore/table/:tableId', {templateUrl: '/app/explore/partials/table_detail.html', controller: 'ExploreTableDetail'});
    $routeProvider.when('/explore/table/:tableId/:entityKey*', {templateUrl: '/app/explore/partials/entity_detail.html', controller: 'ExploreEntityDetail'});
}]);
