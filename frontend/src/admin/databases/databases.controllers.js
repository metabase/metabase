import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import DatabaseList from "./components/DatabaseList.jsx";
import DatabaseEdit from "./components/DatabaseEdit.jsx";


var DatabasesControllers = angular.module('metabase.admin.databases.controllers', ['metabase.services']);

DatabasesControllers.controller('DatabaseList', ['$scope', '$routeParams', 'Metabase', function($scope, $routeParams, Metabase) {

    $scope.DatabaseList = DatabaseList;

    $scope.databases = [];
    $scope.hasSampleDataset = false;
    $scope.created = $routeParams['created'];

    function hasSampleDataset(databases) {
        for (let i=0; i < databases.length; i++) {
            if (databases[i].is_sample) return true;
        }

        return false;
    }

    $scope.delete = function(databaseId) {
        if ($scope.databases) {

            Metabase.db_delete({
                'dbId': databaseId
            }, function(result) {
                $scope.databases = _.filter($scope.databases, function(database) {
                    return database.id != databaseId;
                });
                $scope.hasSampleDataset = hasSampleDataset($scope.databases);
            }, function(error) {
                console.log('error deleting database', error);
            });
        }
    };

    $scope.addSampleDataset = function() {
        if (!hasSampleDataset($scope.databases)) {
            Metabase.db_add_sample_dataset().$promise.then(function(result) {
                $scope.databases.push(result);
                $scope.hasSampleDataset = true;
            }, function(error) {
                console.log('error adding sample dataset', error);
            });
        }
    };

    $scope.engines = MetabaseSettings.get('engines');

    // fetch DBs from the backend
    Metabase.db_list(function(databases) {
        $scope.databases = databases;
        $scope.hasSampleDataset = hasSampleDataset(databases);
    }, function(error) {
        console.log('error getting database list', error);
    });
}]);

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase',
    function($scope, $routeParams, $location, Metabase) {
        $scope.DatabaseEdit = DatabaseEdit;

        // if we're adding a new database then hide the SSL field; we'll determine it automatically <3
        $scope.hiddenFields = {
            ssl: true
        };

        $scope.selectEngine = function(engine) {
            $scope.details.engine = $scope.database.engine = engine;
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
        var create = function(database, details) {
            $scope.$broadcast("form:reset");
            database.details = details;
            return Metabase.db_create(database).$promise.then(function(new_database) {
                $scope.$broadcast("form:api-success", "Successfully created!");
                $scope.$emit("database:created", new_database);
                $location.url('/admin/databases?created');
            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };

        var save = function(database, details) {
            if ($routeParams.databaseId) {
                return update(database, details);
            } else {
                return create(database, details);
            }
        };

        $scope.save = save;

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

        $scope.redirectToDatabases = function() {
            $scope.$apply(() => $location.path('/admin/databases/'));
        };

        function loadExistingDB() {
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
        }

        function prepareEmptyDB() {
            // prepare an empty database for creation
            $scope.database = {
                name: '',
                engine: Object.keys($scope.engines)[0],
                details: {},
                created: false
            };
            $scope.details = {};
        }

        $scope.engines = MetabaseSettings.get('engines');
        if ($routeParams.databaseId) {
            loadExistingDB();
        } else {
            prepareEmptyDB();
        }
    }
]);
