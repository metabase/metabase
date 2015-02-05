'use strict';
/*global _*/

//  Card Controllers
var DataSourceControllers = angular.module('corvusadmin.datasources.controllers', []);

DataSourceControllers.controller('DataSourceList', ['$scope', '$location', 'DataSource', function($scope, $location, DataSource) {

    $scope.delete = function (datasourceId) {
        if ($scope.datasources) {
            DataSource.delete({
                'dataSourceId': datasourceId
            }, function (result) {
                $scope.datasources = _.filter($scope.datasources, function(datasource){
                    return datasource.id != datasourceId;
                });
            }, function (error) {
                console.log('error deleting datasource', error);
            });
        }
    };

    $scope.$watch('currentOrg', function (org) {
        if (!org) return;

        DataSource.list({
            'orgId': org.id
        }, function (datasources) {
            $scope.datasources = datasources;
        }, function (error) {
            console.log('error getting datasources list', error);
        });
    });
}]);

DataSourceControllers.controller('DataSourceDetail', ['$scope', '$routeParams', '$location', 'DataSource', 'SourceTypeHelpers', function($scope, $routeParams, $location, DataSource, SourceTypeHelpers) {

    // $scope.datasource
    // $scope.ingestions
    // $scope.creation_information

    $scope.save = function (datasource) {
        // make sure the parameters are nice and tidy
        var all_parameters = $scope.creation_information.available_datasources[datasource.source_type];
        for(var parameter_id in all_parameters) {
            var parameter = all_parameters[parameter_id];
            if (parameter.parent && !datasource.parameters[parameter.parent]) {
                delete datasource.parameters[parameter.name];
            }
        }

        if ($scope.datasource.id) {
            // if there is already an ID associated with the datasource then we are updating
            DataSource.update(datasource, function (updated_datasource) {
                $scope.datasource = updated_datasource;
            }, function (error) {
                console.log('error updating datasource', error);
            });
        } else {
            // otherwise we are creating a new datasource
            datasource.org = $scope.currentOrg.id;
            DataSource.create(datasource, function (new_datasource) {
                $location.path('/' + $scope.currentOrg.slug + '/admin/datasources/' + new_datasource.id);
            }, function (error) {
                console.log('error creating datasource', error);
            });
        }

    };

    $scope.ingest = function () {
        // lets do it
        DataSource.ingest({
            'dataSourceId': $routeParams.dataSourceId
        }, function (result) {
            // put the new ingestion at the top of the list
            $scope.ingestions.unshift(result);
        }, function (error) {
            console.log('error starting datasource ingestion', error);
        });
    };

    $scope.setPage = function (page_number) {
        $scope.page = page_number;
            DataSource.ingestions({
                'dataSourceId': $routeParams.dataSourceId,
                'pageNumber': $scope.page
            }, function (ingestions) {
                $scope.ingestions = ingestions;
            }, function (error) {
                console.log('error getting datasource ingestions', error);
            });

    };

    $scope.reingest = function () {
        // lets do it
        DataSource.reingest({
            'dataSourceId': $routeParams.dataSourceId
        }, function (result) {
            // put the new ingestion at the top of the list
            $scope.ingestions.unshift(result);
        }, function (error) {
            console.log('error starting datasource ingestion', error);
        });
    };


    $scope.clearTypeParameters = function() {
        // clear type parameters. Might be slicker to keep valid ones as you transition from type to type
        $scope.datasource.parameters = {};
    };

    if ($routeParams.dataSourceId) {
        $scope.page = 1;
        // load existing datasource for editing
        DataSource.get({
            'dataSourceId': $routeParams.dataSourceId
        }, function (datasource) {
            $scope.datasource = datasource;
            $scope.isTimestampedDataSource = SourceTypeHelpers.checkTimestampedDataSource(datasource.source_type);

            // we also need to get the ingestions related to this datasource
            DataSource.ingestions({
                'dataSourceId': $routeParams.dataSourceId,
                'pageNumber': $scope.page
            }, function (ingestions) {
                $scope.ingestions = ingestions;
            }, function (error) {
                console.log('error getting datasource ingestions', error);
            });

        }, function (error) {
            console.log('error loading datasource', error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    } else {
        // prepare an empty datasource for creation
        $scope.datasource = {};
    }

    // we will also need the data to populate our form elements
    DataSource.creation_information(function (creation_info) {
        $scope.creation_information = creation_info;
    }, function (error) {
        console.log('error getting datasource creation info', error);
    });
}]);

DataSourceControllers.controller('DataSourceIngestionView', ['$scope', '$routeParams', '$location', 'DataSourceIngestion', 'DataSource', 'SourceTypeHelpers', function($scope, $routeParams, $location, DataSourceIngestion, DataSource, SourceTypeHelpers) {

    // $scope.datasource_ingestion
    // $scope.logs

    if ($routeParams.dataSourceIngestionId) {
        DataSourceIngestion.get({
            'dataSourceIngestionId': $routeParams.dataSourceIngestionId
        }, function (ingestion) {
            $scope.datasource_ingestion = ingestion;

            // get the datasource.source_type so we know to render the timestamp or not
            DataSource.get({
                'dataSourceId': ingestion.source
            }, function (datasource) {
                $scope.isTimestampedDataSource = SourceTypeHelpers.checkTimestampedDataSource(datasource.source_type);
            }, function (error) {
                console.log('error gettting datasource', error);
            });

            // now get the log details for this ingestion
            DataSourceIngestion.log({
                'dataSourceIngestionId': $routeParams.dataSourceIngestionId
            }, function (captured_log) {
                $scope.logs = captured_log;
            }, function (error) {
                console.log('error gettting datasource ingestion log', error);
            });

        }, function (error) {
            console.log('error getting datasource ingestion', error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    }
}]);
