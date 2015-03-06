'use strict';

var Annotation = angular.module('corvusadmin.annotation', [
  'corvusadmin.annotation.controllers',
]);

Annotation.config(['$routeProvider', function($routeProvider){
    $routeProvider.when('/:orgSlug/admin/annotation/', {templateUrl: '/app/admin/annotation/partials/annotation_list.html', controller: 'AnnotationList'});
    $routeProvider.when('/:orgSlug/admin/annotation/:objectAppLabel/:objectType/:objectId', {templateUrl: '/app/admin/annotation/partials/annotation_list.html', controller: 'AnnotationList'});
}]);

