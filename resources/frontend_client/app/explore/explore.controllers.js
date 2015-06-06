'use strict';
/*jslint browser:true */
/*global _*/
/* global addValidOperatorsToFields*/

var ExploreControllers = angular.module('corvus.explore.controllers', ['corvus.metabase.services']);

ExploreControllers.controller('ExploreDatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {
    $scope.show_non_entities = {};

    Metabase.table_list(function(tables) {
        var databases = {};

        tables.forEach(function(table) {
            var database;
            if (databases[table.db.id]) {
                database = databases[table.db.id];
            } else {
                database = table.db;
                database.entities = [];
                database.non_entities = [];

                databases[table.db.id] = database;
            }

            if (table.entity_name) {
                database.entities.push(table);
            } else {
                database.non_entities.push(table);
            }
            if (database.entities.length > 0) {
                $scope.show_non_entities[database.id] = false;
            } else {
                $scope.show_non_entities[database.id] = true;
            }
        });

        $scope.databases = databases;

    }, function(error) {
        console.log('error getting table list', error);
    });
}]);
