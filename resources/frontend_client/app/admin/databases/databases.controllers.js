"use strict";

import _ from "underscore";

var DatabasesControllers = angular.module('metabaseadmin.databases.controllers', ['metabase.metabase.services']);

DatabasesControllers.controller('DatabaseList', ['$scope', 'Metabase', 'MetabaseCore', function($scope, Metabase, MetabaseCore) {

    $scope.ENGINES = MetabaseCore.ENGINES;

    $scope.databases = [];

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

    Metabase.db_list(function(databases) {
        $scope.databases = databases;
    }, function(error) {
        console.log('error getting database list', error);
    });
}]);

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase', 'MetabaseCore',
    function($scope, $routeParams, $location, Metabase, MetabaseCore) {

        $scope.ENGINES = MetabaseCore.ENGINES;

        // if we're adding a new database then hide the SSL field; we'll determine it automatically <3
        $scope.hiddenFields = {
            ssl: true
        };

        // update an existing Database
        var update = function(database, details) {
            $scope.$broadcast("form:reset");
            database.details = details;
            return Metabase.db_update(database).$promise.then(function(updated_database) {
                $scope.database = updated_database;
                $scope.$broadcast("form:api-success", "Successfully saved!");
            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };

        // create a new Database
        var create = function(database, details, redirectToDetail) {
            $scope.$broadcast("form:reset");
            database.details = details;
            return Metabase.db_create(database).$promise.then(function(new_database) {
                if (redirectToDetail) {
                    $location.path('/admin/databases/' + new_database.id);
                }
                $scope.$broadcast("form:api-success", "Successfully created!");
                $scope.$emit("database:created", new_database);
            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };

        var save = function(database, details, redirectToDetail) {
            if (redirectToDetail === undefined) {
                redirectToDetail = true;
            }

            // validate_connection needs engine so add it to request body
            details.engine = database.engine;

            // for an existing DB check that connection is valid before save
            if ($routeParams.databaseId) {
                return Metabase.validate_connection(details).$promise.catch(function(error) {
                    $scope.$broadcast("form:api-error", error);
                    throw error;
                }).then(function() {
                    return update(database, details);
                });

            // for a new DB we want to infer SSL support. First try to connect w/ SSL. If that fails, disable SSL
            } else {
                details.ssl = true;

                return Metabase.validate_connection(details).$promise.catch(function() {
                    console.log('Unable to connect with SSL. Trying with SSL = false.');
                    details.ssl = false;
                    return Metabase.validate_connection(details).$promise;
                }).then(function() {
                    console.log('Successfully connected to database with SSL = ' + details.ssl + '.');
                    return create(database, details, redirectToDetail);
                }).catch(function(error) {
                    $scope.$broadcast("form:api-error", error);
                    throw error;
                });
            }
        };

        $scope.save = save;

        $scope.saveAndRedirect = function() {
            return save($scope.database, $scope.details, true);
        };

        $scope.saveNoRedirect = function() {
            return save($scope.database, $scope.details, false);
        };

        $scope.sync = function() {
            var call = Metabase.db_sync_metadata({
                'dbId': $scope.database.id
            });

            return call.$promise;
        };

        $scope.delete = function() {
            Metabase.db_delete({
                'dbId': $scope.database.id
            }, function(result) {
                $location.path('/admin/databases/');
            }, function(error) {
                console.log('error deleting database', error);
            });
        };

        // load our form input data
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
                $scope.hiddenFields = null;
                $scope.database = database;
                $scope.details = database.details;
            }, function(error) {
                console.log('error loading database', error);
                if (error.status == 404) {
                    $location.path('/admin/databases/');
                }
            });
        } else {
            // prepare an empty database for creation
            $scope.database = {
                name: '',
                engine: null,
                details: {},
                created: false
            };
            $scope.details = {};
        }
    }
]);
