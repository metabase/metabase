'use strict';

var DatasetDirectives = angular.module('corvusadmin.datasets.directives', []);


DatasetDirectives.directive('cvFieldRelationshipModal', ['Metabase', '$modal', function(Metabase, $modal) {
    function link(scope, element, attrs) {

        scope.$watch('field', function(field_value) {
            if (field_value) {
                var openSetFieldRelationshipModal = function() {
                    var modalInstance = $modal.open({
                        templateUrl: '/app/admin/datasets/partials/modal_field_relationship.html',
                        controller: ['$scope', '$modalInstance', 'field', function($scope, $modalInstance, field) {
                            var formName = 'setFieldRelationship';

                            $scope.formData = {
                                idfields: []
                            };

                            $scope.fk = {};

                            // fetch the ID fields
                            Metabase.db_idfields({
                                'dbId': field.table.db.id
                            }, function(result) {
                                if (result && !result.error) {
                                    $scope.formData.idfields = result;
                                    result.forEach(function(field) {
                                        field.displayName = field.table.name + '.' + field.name;
                                    });
                                } else {
                                    console.log(result);
                                }
                            });

                            $scope.submit = function() {
                                var fk = $scope.fk;
                                fk.fieldId = field.id;
                                fk.db = field.table.db.id;
                                console.log(fk);
                                Metabase.field_addfk(fk, function(result) {
                                    if (result && !result.error) {
                                        $scope.close();

                                        // notify caller if they want (?)
                                        if (scope.callback) {
                                            scope.callback(result);
                                        }
                                    } else {
                                        console.log(result);
                                    }
                                });
                            };

                            $scope.close = function() {
                                // scope.show = false;
                                $modalInstance.dismiss('cancel');
                            };
                        }],
                        resolve: {
                            field: function() {
                                return scope.field;
                            }
                        }
                    });
                };
                element.click(openSetFieldRelationshipModal);
            }
        });
    }

    return {
        restrict: 'A',
        link: link,
        scope: {
            displayName: '=',
            field: '=',
            callback: '='
        }
    };
}]);