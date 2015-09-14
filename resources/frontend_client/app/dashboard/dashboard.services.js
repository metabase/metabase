'use strict';

// Dashboard Services
var DashboardServices = angular.module('metabase.dashboard.services', ['ngResource', 'ngCookies']);

DashboardServices.factory('Dashboard', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/dashboard/:dashId', {}, {
        list: {
            url:'/api/dashboard?org=:orgId&f=:filterMode',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/dashboard',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        get: {
            method:'GET',
            params:{dashId:'@dashId'},
        },
        update: {
            method:'PUT',
            params:{dashId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        addcard: {
            url:'/api/dashboard/:dashId/cards',
            method:'POST',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        removecard: {
            url:'/api/dashboard/:dashId/cards',
            method:'DELETE',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        reposition_cards: {
            url:'/api/dashboard/:dashId/reposition',
            method:'POST',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        }
    });
}]);
