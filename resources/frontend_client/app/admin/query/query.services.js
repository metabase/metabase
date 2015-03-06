'use strict';

// QueryService Services
var QueryServiceServices = angular.module('corvusadmin.queryservice.services', ['ngResource', 'ngCookies']);
QueryServiceServices.factory('QueryService', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/qs', {}, {
        run: {
            url:'/api/qs/',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }}
        },
        get: {
            url:'/api/qs/:queryId/',
            method:'GET',
            params:{queryId:'@queryId'},
        }
    });
}]);

// Query Services
var QueryServices = angular.module('corvusadmin.query.services', ['ngResource', 'ngCookies']);
QueryServices.factory('Query', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/query/:queryId', {}, {
        form_input: {
            url:'/api/query/form_input?org=:orgId',
            method:'GET',
        },
        list: {
            url:'/api/query?org=:orgId&f=:filterMode',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/query',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        get: {
            method:'GET',
            params:{queryId:'@queryId'}
        },
        update: {
            method:'PUT',
            params:{queryId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{queryId:'@queryId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        execute: {
            method:'POST',
            params:{queryId:'@queryId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        results: {
            url:'/api/query/:queryId/results',
            method:'GET',
            params:{queryId:'@queryId'},
            isArray:true
        }
    });
}]);

QueryServices.factory('QueryResult', ['$resource', function($resource) {
    return $resource('/api/result/:resultId', {}, {
        get: {
            method:'GET',
            params:{resultId:'@resultId'}
        },
        response: {
            url:'/api/result/:resultId/response',
            method:'GET',
            params:{resultId:'@resultId'},
        }
    });
}]);

QueryServices.factory('QueryResultResponse', ['$resource', function($resource) {
    return $resource('/api/queryresult/:queryResultId', {}, {
        get: {method:'GET', params:{queryResultId:''}},
    });
}]);
