'use strict';
/*jslint browser:true */
/*global _*/
/* global addValidOperatorsToFields*/

var ExploreControllers = angular.module('corvus.explore.controllers', ['corvus.metabase.services']);

ExploreControllers.controller('ExploreDatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.databases = [];
    $scope.currentDB = {};
    $scope.tables = [];

    Metabase.db_list(function (databases) {
        $scope.databases = databases;
        $scope.selectCurrentDB(0)
    }, function (error) {
        console.log(error);
    });


    $scope.selectCurrentDB = function(index) {
        $scope.currentDB = $scope.databases[index];
        Metabase.db_tables({
            'dbId': $scope.currentDB.id
        }, function (tables) {
            $scope.tables = tables;
        }, function (error) {
            console.log(error);
        })
    }
}]);
