'use strict';

// ETL
var ETL = angular.module('corvus.etl', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.etl.controllers',
    'corvus.etl.services'
]);

ETL.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/etl/ingestions/events/:db', {templateUrl: '/app/etl/partials/ingestion_events.html', controller: 'ETLIngestionList'});
    $routeProvider.when('/:orgSlug/etl/ingestions/txndb/:db', {templateUrl: '/app/etl/partials/ingestion_txndb.html', controller: 'ETLIngestionList'});
}]);
