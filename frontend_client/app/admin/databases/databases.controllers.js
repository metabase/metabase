"use strict";
/*global _*/

var DatabasesControllers = angular.module('corvusadmin.databases.controllers', ['corvus.metabase.services']);

DatabasesControllers.controller('DatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.delete = function (datamartId) {
        if ($scope.datamarts) {

            Metabase.db_delete({
                'dbId': datamartId
            }, function (result) {
                $scope.datamarts = _.filter($scope.datamarts, function(datamart){
                    return datamart.id != datamartId;
                });
            }, function (error) {
                console.log('error deleting datamart', error);
            });
        }
    };

    $scope.$watch('currentOrg', function(org) {
        if (org) {
            $scope.datamarts = [];

            Metabase.db_list({
                'orgId': org.id
            }, function (datamarts) {
                // if we are an org that 'inherits' lets only show our our own dbs in this view
                if (org.inherits) {
                    var dm = _.filter(datamarts, function (datamart) {
                        return datamart.organization.id === org.id;
                    });
                    $scope.datamarts = dm;
                } else {

                    $scope.datamarts = datamarts;
                }
            }, function (error) {
                console.log('error getting database list', error);
            });
        }
    });
}]);

DatabasesControllers.controller('DatabaseEdit', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    Metabase.db_form_input(function (form_input) {
        $scope.form_input = form_input;
    }, function (error) {
        console.log('error getting datamart form_input', error);
    });

    if ($routeParams.databaseId) {
        // load existing database for editing
        Metabase.db_get({
            'dbId': $routeParams.databaseId
        }, function (datamart) {
            $scope.datamart = datamart;
        }, function (error) {
            console.log('error loading datamart', error);
            if (error.status == 404) {
                $location.path('/admin/databases/');
            }
        });
    } else {
        // prepare an empty database for creation
        $scope.datamart = {
            "name": "",
            "engine": "postgres",
            "details": {}
        };
    }

    $scope.save = function (datamart) {
        if ($routeParams.databaseId) {
            // updating existing database
            Metabase.db_update(datamart, function (updated_datamart) {
                $scope.datamart = updated_datamart;
            }, function (error) {
                console.log('error loading datamart', error);
                if (error.status == 404) {
                  $location.path('/superadmin/datamarts/');
                }
            });
        } else {
            // creating a new database
            datamart.org = $scope.currentOrg.id;
            Metabase.db_create(datamart, function (new_datamart) {
                $location.path('/'+$scope.currentOrg.slug+'/admin/databases/' + new_datamart.id);
            }, function (error) {
                console.log('error creating datamart', error);
            });
        }
    };
}]);
