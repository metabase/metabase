'use strict';

var AnnotationServices = angular.module('corvus.annotation.services', ['ngResource', 'ngCookies']);

AnnotationServices.factory('Annotation', ['$resource', '$cookies',
    function($resource, $cookies){
        return $resource('/api/annotation/:annotationId', {}, {
            list: {
                url: '/api/annotation/',
                method:'GET',
                isArray:true
            },
            create: {
                url: '/api/annotation',
                method:'POST',
                headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }}
            },
            get: {
                url: '/api/annotation/:annotationId',
                method:'GET'
            },
            update: {
                url: '/api/annotation/:annotationId',
                params:{
                    annotation_id: '@annotationId'
                },
                method:'PUT',
                headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }}
            },
            delete: {
                url: '/api/annotation/:annotationId',
                method:'DELETE',
                headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
            }
        });
    }
]);
