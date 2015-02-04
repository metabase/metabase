'use strict';
/*global _*/

var AnnotationControllers = angular.module('corvusadmin.annotation.controllers', ['ngRoute', 'corvus.services', 'corvus.forms.directives']);

AnnotationControllers.controller('AnnotationList', ['$scope', '$routeParams', 'Annotation',
    function($scope, $routeParams, Annotation){


        $scope.$watch('currentOrg', function (org) {
            if(!org) return;
            var listParams = {
                orgId: org.id
            };
            var listMethod = Annotation.list;
            $scope.allowCreate = false;
            if(typeof $routeParams.objectAppLabel !== "undefined" &&
                $routeParams.objectType !== "undefined" &&
                $routeParams.objectId !== "undefined"){
                listParams.objectAppLabel = $routeParams.objectAppLabel;
                listParams.objectType = $routeParams.objectType;
                listParams.objectId = $routeParams.objectId;
                listMethod = Annotation.list_for_object;
                $scope.allowCreate = true;
            }
            listMethod(listParams, function(annotations){
                $scope.annotations = annotations;
            }, function(error){
                console.log("ERROR retrieving annotations:");
                console.log(error);
            });
        });

        $scope.deleteAnnotation = function(annotation_id){
            Annotation.delete({
                'annotationId': annotation_id
            }, function(result){
                $scope.annotations = _.filter($scope.annotations, function(annotation){
                    return annotation.id != annotation_id;
                });
            }, function(error){
                console.log("failed to delete annotation:");
                console.log(error);
            });
        };

    }
]);

AnnotationControllers.controller('CreateAnnotation', ['$scope', '$routeParams', 'Annotation', 'CorvusFormService', 'CorvusCore',
    function($scope, $routeParams, Annotation, CorvusFormService, CorvusCore){
        var formName = "createAnnotationForm";
        var _self = this;
        _self.newAnnotation = {};
        CorvusCore.currentUser(function(result) {
            if (result && !result.error) {
                _self.newAnnotation.author = result.id;
            }
        });
        $scope.submit = function(){
            if(!$scope.currentOrg) return;

            var submitSuccessMessage = "annotation created successfully";
            var submitFailedMessage = "failed to create annotation!";

            _self.newAnnotation.organization = $scope.currentOrg.id;
            _self.newAnnotation.object_app_label = $routeParams.objectAppLabel;
            _self.newAnnotation.object_type = $routeParams.objectType;
            _self.newAnnotation.object_id = $routeParams.objectId;

            Annotation.create(_self.newAnnotation, function(result){
                CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);
            }, function(errors){
                CorvusFormService.submitFailedCallback(formName, errors.data, submitFailedMessage);
            });
        };
    }
]);
