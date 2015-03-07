'use strict';

var Search = angular.module('corvus.search', [
    'corvus.search.controllers',
    'corvus.search.services'
]);

Search.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/search', {templateUrl: '/app/search/partials/search.html', controller: 'SearchController'});
    $routeProvider.otherwise({redirectTo: '/'});
}]);
