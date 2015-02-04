'use strict';

// ETL Controllers
var ETLControllers = angular.module('corvus.etl.controllers', []);

ETLControllers.controller('ETLIngestionList', ['$scope', '$routeParams', '$location', 'ETL', function($scope, $routeParams, $location, ETL) {
    $scope.setPage = function(page) {
        // what type of ingestions are we displaying?
        var etltype = $location.path().split('/')[4];
        ETL.ingestion_list({
            'type': etltype,
            'dbId': $routeParams.db,
            'page': page
        }, function(result) {
            $scope.ingestions = result;
            $scope.page = page;
        }, function (error) {
            console.log(error);
            $location.path('/');
        });
    };

    $scope.setPage(1);
}]);
