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


AdminDatasetsControllers.controller('AdminDatasetEdit', ['$scope', '$routeParams', '$location', 'Metabase', 'ForeignKey', function($scope, $routeParams, $location, Metabase, ForeignKey) {

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


    Metabase.table_query_metadata({
        'tableId': $routeParams.tableId
    }, function(result) {
        $scope.table = result;
        $scope.getIdFields();
        $scope.decorateWithTargets();
    }, function(error) {
        console.log(error);
        if (error.status == 404) {
            $location.path('/');
        }
    });

    $scope.getIdFields = function(){
            // fetch the ID fields
        Metabase.db_idfields({
            'dbId': $scope.table.db.id
        }, function(result) {
            if (result && !result.error) {
                $scope.idfields = result;
                result.forEach(function(field) {
                    field.displayName = field.table.name + '.' + field.name;
                });
            } else {
                console.log(result);
            }
        });

    };
    
    $scope.decorateWithTargets = function(){
        console.log($scope.table);
        $scope.table.fields.forEach(function(field){
            if (field.target){
                field.target_id = field.target.id;
            }
        });
    };

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

    $scope.inlineSpecialTypeChange = function(idx){
        // If we are changing the field from a FK to something else, we should delete any FKs present
        var field = $scope.table.fields[idx];
        if (field.target_id && field.special_type != "fk"){
            // we have something that used to be an FK and is now not an FK
            // Let's delete its foreign keys
            var fks = Metabase.field_foreignkeys({'fieldId': field.id}, function(result){
                fks.forEach(function(fk){
                    console.log("deleting ", fk);
                    ForeignKey.delete({'fkID': fks[0].id}, function(result){
                        console.log("deleted fk");
                    }, function(error){
                        console.log("error deleting fk");
                    });
                });
            });
            // clean up after ourselves
            field.target = null;
            field.target_id = null;
        }
        // save the field
        $scope.inlineSaveField(idx);
    };

    $scope.inlineSaveField = function(idx) {
        if ($scope.table.fields && $scope.table.fields[idx]) {
            Metabase.field_update($scope.table.fields[idx], function(result) {
                if (result && !result.error) {
                    $scope.table.fields[idx] = result;
                } else {
                    console.log(result);
                }
            });
        }
    };

    $scope.inlineChangeFKTarget = function(idx) {
        // This function notes a change in the target of the target of a foreign key
        // If there is already a target, we should delete that FK and create a new one
        // This is meant to be transitional until we add an FK modify function to the API
        // If there was not a target, we should create a new FK
        if ($scope.table.fields && $scope.table.fields[idx]) {
            var field = $scope.table.fields[idx];
            var new_target_id = field.target_id;

            var fks = Metabase.field_foreignkeys({'fieldId': field.id});

            if(fks.length > 0){
                // delete this key
                var relationship_id = 0;
                 ForeignKey.delete({'fkID': fks[0].id}, function(result){
                            console.log("Deleted FK");
                            Metabase.field_addfk({"db": field.table.db.id, "fieldId":field.id,'target_field': new_target_id, "relationship": "Mt1"});
                            
                        }, function(error){
                            console.log('Error deleting key ', error);
                        });
            }else{

                Metabase.field_addfk({"db": field.table.db.id, "fieldId":field.id,'target_field': new_target_id, "relationship": "Mt1"});
            }
        }
    };

    $scope.deleteTarget = function(field, target){

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
