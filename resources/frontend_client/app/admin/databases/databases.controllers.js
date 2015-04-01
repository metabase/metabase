"use strict";
/*global _*/

var DatabasesControllers = angular.module('corvusadmin.databases.controllers', ['corvus.metabase.services']);

DatabasesControllers.controller('DatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.delete = function(databaseId) {
        if ($scope.databases) {

            Metabase.db_delete({
                'dbId': databaseId
            }, function(result) {
                $scope.databases = _.filter($scope.databases, function(database) {
                    return database.id != databaseId;
                });
            }, function(error) {
                console.log('error deleting database', error);
            });
        }
    };

    $scope.$watch('currentOrg', function(org) {
        if (org) {
            $scope.databases = [];

            Metabase.db_list({
                'orgId': org.id
            }, function(databases) {
                // if we are an org that 'inherits' lets only show our our own dbs in this view
                if (org.inherits) {
                    var dm = _.filter(databases, function(database) {
                        return database.organization.id === org.id;
                    });
                    $scope.databases = dm;
                } else {

                    $scope.databases = databases;
                }
            }, function(error) {
                console.log('error getting database list', error);
            });
        }
    });
}]);

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    $scope.ENGINES = {
        postgres: {
            name: "Postgres",
            example: "host=[ip address] port=5432 dbname=examples user=corvus password=******"
        },
        h2: {
            name: "H2",
            example: "file:[filename]"
        }
    };

    Metabase.db_form_input(function(form_input) {
        $scope.form_input = form_input;
    }, function(error) {
        console.log('error getting database form_input', error);
    });

    if ($routeParams.databaseId) {
        // load existing database for editing
        Metabase.db_get({
            'dbId': $routeParams.databaseId
        }, function(database) {
            $scope.database = database;
        }, function(error) {
            console.log('error loading database', error);
            if (error.status == 404) {
                $location.path('/admin/databases/');
            }
        });
    } else {
        // prepare an empty database for creation
        $scope.database = {
            "name": "",
            "engine": 'postgres',
            "details": {}
        };
    }

    $scope.save = function(database) {
        if ($routeParams.databaseId) {
            // updating existing database
            Metabase.db_update(database, function(updated_database) {
                $scope.database = updated_database;
            }, function(error) {
                console.log('error loading database', error);
                if (error.status == 404) {
                    $location.path('/admin/databases/');
                }
            });
        } else {
            // creating a new database
            database.org = $scope.currentOrg.id;
            Metabase.db_create(database, function(new_database) {
                $location.path('/' + $scope.currentOrg.slug + '/admin/databases/' + new_database.id);
            }, function(error) {
                console.log('error creating database', error);
            });
        }
    };
}]);