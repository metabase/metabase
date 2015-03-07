"use strict";
/*global _*/

var AdminDatasetsControllers = angular.module('corvusadmin.datasets.controllers', ['corvus.metabase.services', 'corvus.annotation.services', 'corvus.annotation.directives']);

AdminDatasetsControllers.controller('AdminDatasetList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.syncDatabase = function (databaseId) {
        Metabase.db_sync_metadata({
            'dbId': databaseId
        }, function (result) {
            // hmmm, what should we do here?
        }, function (error) {
            console.log('error syncing database', error);
        });
    };

    $scope.$watch('currentOrg', function(org) {
        if (org) {
            $scope.databases = [];

            Metabase.db_list({
                'orgId': org.id
            }, function (dbs) {
                _.map(dbs, function(db) {
                    $scope.databases.push(db);
                });

                _.map($scope.databases, function(db, index) {
                    var dbindex = index;
                    Metabase.db_tables({'dbId': db.id}, function (tables) {
                        $scope.databases[dbindex].tables = tables;
                    });
                });
            }, function (error) {
                console.log('error getting database list', error);
            });
        }
    });
}]);


AdminDatasetsControllers.controller('AdminDatasetEdit', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    $scope.annotations = [];
    $scope.fields = [];

    $scope.dragControlListeners = {
        containment: '.EntityGroup',
        orderChanged: function(event) {
            // Change order here
            var new_order = _.map($scope.fields, function(field){return field.id;});
            Metabase.table_reorder_fields({'tableId': $routeParams.tableId, 'new_order': new_order});
        },
    };

    Metabase.table_get({
        'tableId': $routeParams.tableId
    }, function(result) {
        $scope.table = result;

        // get the fields for this table
        Metabase.table_fields({
            'tableId': $routeParams.tableId
        }, function(result) {
            $scope.fields = result;
        });

        // table annotations

    }, function(error) {
        console.log(error);
        if (error.status == 404) {
            $location.path('/');
        }
    });

    $scope.syncMetadata = function () {
        Metabase.table_sync_metadata({
            'tableId': $routeParams.tableId
        }, function (result) {
            // nothing to do here really
        }, function (error) {
            console.log('error doing metabase sync', error);
        });
    };

    $scope.inlineSave = function() {
        if ($scope.table) {
            Metabase.table_update($scope.table, function(result) {
                if (result && !result.error) {
                    $scope.table = result;
                } else {
                    console.log(result);
                }
            });
        }
    };

    $scope.inlineSaveField = function(idx) {
        if ($scope.fields && $scope.fields[idx]) {
            Metabase.field_update($scope.fields[idx], function(result) {
                if (result && !result.error) {
                    $scope.fields[idx] = result;
                } else {
                    console.log(result);
                }
            });
        }
    };
}]);


AdminDatasetsControllers.controller('AdminTableDependents', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

 if ($routeParams.tableId) {
        Metabase.table_dependents({
            'tableId': $routeParams.tableId
        }, function(result) {
            $scope.dependents = result;
        });
    }
}]);


AdminDatasetsControllers.controller('AdminFieldDetail', ['$scope', '$routeParams', '$location', 'Metabase', 'ForeignKey', function($scope, $routeParams, $location, Metabase, ForeignKey) {

    // $scope.field
    // $scope.pivots
    // $scope.fks
    $scope.modalShown = false;

    if ($routeParams.fieldId) {
        Metabase.field_get({
            'fieldId': $routeParams.fieldId
        }, function(result) {
            $scope.field = result;

            // grab where this field is foreign keyed to
            Metabase.field_foreignkeys({
                'fieldId': $routeParams.fieldId
            }, function (result) {
                $scope.fks = result;
            }, function (error) {
                console.log('error getting fks for field', error);
            });

            // grab summary data about our field
            Metabase.field_summary({
                'fieldId': $routeParams.fieldId
            }, function (result){
                $scope.field_summary = result;
            }, function (error){
                console.log('error gettting field summary', error);
            });

            // grab our field values
            Metabase.field_values({
                'fieldId': $routeParams.fieldId
            }, function (result){
                $scope.field_values = result;
            }, function (error){
                console.log('error getting field values', error);
            });
        }, function (error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    }

    $scope.inlineSave = function() {
        console.log($scope.field);
        if ($scope.field) {
            Metabase.field_update($scope.field, function(result) {
                if (result && !result.error) {
                    $scope.field = result;
                } else {
                    console.log(result);
                }
            });
        }
    };

    $scope.updateMappedValues = function(){
        Metabase.field_value_map_update({
            'fieldId': $routeParams.fieldId,
            'values_map': $scope.field_values.human_readable_values
        }, function (result){
            // nothing to do
        }, function (error){
            console.log('Error');
        });
    };

    $scope.toggleAddRelationshipModal = function() {
        // toggle display
        $scope.modalShown = !$scope.modalShown;
    };

    $scope.relationshipAdded = function(relationship) {
        // this is here to clone the original array so that we can modify it
        // by default the deserialized data from an api response is immutable
        $scope.fks = $scope.fks.slice(0);
        $scope.fks.push(relationship);
    };
     $scope.deleteRelationship = function(relationship_id) {
        // this is here to clone the original array so that we can modify it
        // by default the deserialized data from an api response is immutable
        ForeignKey.delete({'fkID': relationship_id}, function(result){
            $scope.fks = _.reject($scope.fks, function(fk){return fk.id == relationship_id;});
        }, function(error){
            console.log('Error deleting key ', error);
        });
    };
}]);
