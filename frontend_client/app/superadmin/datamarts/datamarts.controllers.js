"use strict";
/*global _*/

var DatamartsControllers = angular.module('superadmin.datamarts.controllers', []);

DatamartsControllers.controller('DatamartList', ['$scope', 'Datamart', function($scope, Datamart) {
    Datamart.list(function (datamarts) {
        $scope.datamarts = datamarts;
    }, function (error) {
        console.log('error getting datamarts list', error);
    });

    $scope.delete = function (datamartId) {
        if ($scope.datamarts) {

            Datamart.delete({
                'datamartId': datamartId
            }, function (result) {
                $scope.datamarts = _.filter($scope.datamarts, function(datamart){
                    return datamart.id != datamartId;
                });
            }, function (error) {
                console.log('error deleting datamart', error);
            });
        }
    };
}]);

DatamartsControllers.controller('DatamartEdit', ['$scope', '$routeParams', '$location', 'Datamart', function($scope, $routeParams, $location, Datamart) {

    Datamart.form_input(function (form_input) {
        $scope.form_input = form_input;
    }, function (error) {
        console.log('error getting datamart form_input', error);
    });

    if ($routeParams.datamartId) {
        // load existing datamart for editing
        Datamart.get({
            'datamartId': $routeParams.datamartId
        }, function (datamart) {
            $scope.datamart = datamart;
        }, function (error) {
            console.log('error loading datamart', error);
            if (error.status == 404) {
                $location.path('/superadmin/datamarts/');
            }
        });
    } else {
        // prepare an empty datamart for creation
        $scope.datamart = {
            "name": "",
            "engine": "postgres",
            "details": {}
        };
    }

    $scope.save = function (datamart) {
        if ($routeParams.datamartId) {
            // updating existing datamart
            Datamart.update(datamart, function (updated_datamart) {
                $scope.datamart = updated_datamart;
            }, function (error) {
                console.log('error loading datamart', error);
                if (error.status == 404) {
                  $location.path('/superadmin/datamarts/');
                }
            });
        } else {
            // creating a new datamart
            Datamart.create(datamart, function (new_datamart) {
                $location.path('/superadmin/datamarts/' + new_datamart.id);
            }, function (error) {
                console.log('error creating datamart', error);
            });
        }
    };
}]);
