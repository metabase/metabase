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

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase',
    function($scope, $routeParams, $location, Metabase) {

        var formFields = {
            name: 'name',
            engine: 'engine'
            // details is handled manually
        };

        $scope.foo = function() {
            console.log($scope.form);
        };

        // takes in our API form database details and parses them into a map of usable form field values
        var parseDetails = function(engine, details) {
            var map = {};
            if (engine === 'postgres') {
                details.conn_str.split(' ').forEach(function (val) {
                    var split = val.split('=');
                    if (split.length === 2) {
                        map[split[0]] = split[1];
                    }
                });
            } else if (engine === 'h2') {
                map.file = details.conn_str.substring(5);
            }

            return map;
        };

        // takes in a map of our form field values and builds them into our API form database details
        var buildDetails = function(engine, details) {
            var conn_str;
            if (engine === 'postgres') {
                conn_str = "host="+details.host+" port="+details.port+" dbname="+details.dbname+" user="+details.user+" password="+details.pass;
            } else if (engine === 'h2') {
                conn_str = "file:"+details.file;
            } else {
                conn_str = "";
            }

            return {
                'conn_str': conn_str
            };
        };

        var parseFormErrors = function(error) {
            // client side validation error
            if (error.data.errors) {
                // field validation error(s)
                Object.keys(error.data.errors).forEach(function (key) {
                    if (formFields[key] !== 'undefined') {
                        // this simply takes the error message from our api response and
                        // applies it to the correct form field in our angular form object
                        $scope.form[formFields[key]].$error.message = error.data.errors[key];
                    }
                });
            } else if (error.data.message) {
                // generic error not attributed to specific field
                $scope.form.$error.message = error.data.message;
            }
        };

        // update an existing Database
        var update = function(database, details) {
            database.details = buildDetails(database.engine, details);
            Metabase.db_update(database, function (updated_database) {
                $scope.database = updated_database;
            }, parseFormErrors);
        };

        // create a new Database
        var create = function(database, details) {
            database.org = $scope.currentOrg.id;
            database.details = buildDetails(database.engine, details);
            Metabase.db_create(database, function (new_database) {
                $location.path('/' + $scope.currentOrg.slug + '/admin/databases/' + new_database.id);
            }, parseFormErrors);
        };

        $scope.save = function(database, details) {
            if ($routeParams.databaseId) {
                update(database, details);
            } else {
                create(database, details);
            }
        };

        // load our form input data
        Metabase.db_form_input(function (form_input) {
            $scope.form_input = form_input;
        }, function (error) {
            console.log('error getting database form_input', error);
        });

        if ($routeParams.databaseId) {
            // load existing database for editing
            Metabase.db_get({
                'dbId': $routeParams.databaseId
            }, function (database) {
                $scope.database = database;
                $scope.details = parseDetails(database.engine, database.details);
            }, function (error) {
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
            $scope.details = {};
        }
    }
]);
