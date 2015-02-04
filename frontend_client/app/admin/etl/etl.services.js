'use strict';

// ETL Services

var EtlServices = angular.module('corvusadmin.etl.services', ['ngResource', 'ngCookies']);

EtlServices.factory('EtlJob', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/etl/job/:jobId', {}, {
        form_input: {
            url:'/api/etl/job/form_input',
            method:'GET',
        },
        list: {
            url:'/api/etl/job/?org=:orgId&f=:filterMode',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/etl/job',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        get: {
            method:'GET',
            params:{jobId:'@jobId'}
        },
        update: {
            method:'PUT',
            params:{jobId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{jobId:'@jobId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        execute: {
            method:'POST',
            params:{jobId:'@jobId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        job_execs: {
            url:'/url/etl/job/@jobId/execs',
            method:'GET',
            params:{jobId:'@jobId'}
        }
    });
}]);

EtlServices.factory('EtlJobExec', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/etl/jobexec/:execId', {}, {
        list: {
            url:'/api/etl/jobexec?org=:orgId',
            method:'GET',
            isArray:true
        },
        get: {
            method:'GET',
            params:{execId:'@execId'}
        }
    });
}]);
