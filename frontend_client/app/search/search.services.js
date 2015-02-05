'use strict';

var SearchServices = angular.module('corvus.search.services', ['ngResource', 'ngCookies']);

SearchServices.factory('Search', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/search', {}, {
        search: {
            url: '/api/search',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },

        model_choices: {
            url: '/api/search/model_choices',
            method: 'GET',
            params: {
                'org': '@org'
            }
        },

        reindexAll: {
            url: '/api/search/reindex',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        }
    });
}]);