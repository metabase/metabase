import _ from "underscore";

var DatabasesControllers = angular.module('metabaseadmin.databases.controllers', ['metabase.metabase.services']);

DatabasesControllers.controller('DatabaseList', ['$scope', 'Metabase', 'MetabaseCore', function($scope, Metabase, MetabaseCore) {

    // load the form input so we convert engine key (e.g. 'postgres') to the nice name (e.g. "PostgreSQL")
    // we'll just fall back to displaying engine key until then.
    Metabase.db_form_input(function(form_input) {
        $scope.form_input = form_input;
    }, function(error) {
        console.log('error getting database form_input', error);
    });

    $scope.databases = [];
    $scope.hasSampleDataset = false;

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

    Metabase.db_list(function(databases) {
        $scope.databases = databases;
        $scope.hasSampleDataset = hasSampleDataset(databases);
    }, function(error) {
        console.log('error getting database list', error);
    });
}]);

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase', 'MetabaseCore',
    function($scope, $routeParams, $location, Metabase, MetabaseCore) {

        // load our form input data
        Metabase.db_form_input(function(form_input) {
            $scope.form_input = form_input;
        }, function(error) {
            console.log('error getting database form_input', error);
        });

        // if we're adding a new database then hide the SSL field; we'll determine it automatically <3
        $scope.hiddenFields = {
            ssl: true
        };

        function prepareDatabaseDetails(details) {
            if (!details.engine) throw "Missing key 'engine' in database request details; please add this as API expects it in the request body.";

            // iterate over each field definition
            $scope.form_input.engines[details.engine]['details-fields'].forEach(function(field) {
                // set default value if applicable
                if (!details[field.name] && field.default) {
                    details[field.name] = field.default;
                }

                // apply transformation function if applicable
                if (details[field.name] && field.type === 'integer') {
                    details[field.name] = parseInt(details[field.name]);
                }
            });

            return details;
        }

        function validateConnection(details) {
            return Metabase.validate_connection(prepareDatabaseDetails(details)).$promise;
        }

        // update an existing Database
        var update = function(database, details) {
            $scope.$broadcast("form:reset");
            database.details = prepareDatabaseDetails(details);
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
            database.details = prepareDatabaseDetails(details);
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

            function handleError(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            }


            // for an existing DB check that connection is valid before save
            if ($routeParams.databaseId) {
                return validateConnection(details).catch(handleError).then(function() {
                    return update(database, details);
                });

            // for a new DB we want to infer SSL support. First try to connect w/ SSL. If that fails, disable SSL
            } else {
                const dbSupportsSSL = _.contains(_.map($scope.form_input.engines[database.engine]['details-fields'], 'name'), 'ssl');

                function createDB() {
                    console.log('Successfully connected to database with SSL = ' + details.ssl + '.');
                    return create(database, details, redirectToDetail);
                }

                if (dbSupportsSSL) {
                    details.ssl = true;
                    return validateConnection(details).catch(function() {
                        console.log('Unable to connect with SSL. Trying with SSL = false.');
                        details.ssl = false;
                        return validateConnection(details);
                    }).then(createDB).catch(handleError);
                } else {
                    delete details.ssl;
                    return validateConnection(details).catch(handleError).then(createDB);
                }
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
