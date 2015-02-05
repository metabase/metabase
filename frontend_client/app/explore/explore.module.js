'use strict';

// Explore (Metabase)
var Explore = angular.module('corvus.explore', [
    'corvus.explore.controllers',
    'corvus.explore.services',
    'corvus.explore.directives'
]);

Explore.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/explore/', {templateUrl: '/app/explore/partials/database_list.html', controller: 'ExploreDatabaseList'});
    $routeProvider.when('/:orgSlug/explore/table/:tableId', {templateUrl: '/app/explore/partials/table_detail.html', controller: 'ExploreTableDetail'});
    $routeProvider.when('/:orgSlug/explore/table/:tableId/cohorts', {templateUrl: '/app/explore/partials/table_cohorts.html', controller: 'ExploreTableCohorts'});
    $routeProvider.when('/:orgSlug/explore/table/:tableId/segments', {templateUrl: '/app/explore/partials/table_segment.html', controller: 'ExploreTableSegment'});
    $routeProvider.when('/:orgSlug/explore/table/:tableId/metadata', {templateUrl: '/app/explore/partials/table_metadata.html', controller: 'ExploreTableMetadata'});
    $routeProvider.when('/:orgSlug/explore/table/:tableId/:entityKey*', {templateUrl: '/app/explore/partials/entity_detail.html', controller: 'ExploreEntityDetail'});
}]);
