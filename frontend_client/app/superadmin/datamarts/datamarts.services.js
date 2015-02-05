'use strict';

// Datamart Services
var DatamartsServices = angular.module('superadmin.datamarts.services', ['ngResource', 'ngCookies']);

DatamartsServices.factory('Datamart', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/datamart/:datamartId', {}, {
        form_input: {
            url:'/api/datamart/form_input',
            method:'GET',
        },
        list: {
            url:'/api/datamart/',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/datamart/',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        get: {
            method:'GET',
            params:{datamartId:'@datamartId'}
        },
        update: {
            method:'PUT',
            params:{datamartId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{datamartId:'@datamartId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        }
    });
}]);
