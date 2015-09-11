'use strict';

// Dashboard Services
var DashboardServices = angular.module('metabase.dashboard.services', ['ngResource', 'ngCookies']);

DashboardServices.factory('Dashboard', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/dash/:dashId', {}, {
        list: {
            url:'/api/dash?org=:orgId&f=:filterMode',
            method:'GET',
            isArray:true
        },
        for_card: {
            url:'/api/dash/for_card/:cardId?f=:filterMode',
            method:'GET',
            params:{cardId:'@cardid'},
            isArray:true
        },
        create: {
            url:'/api/dash',
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
            url:'/api/dash/:dashId/cards',
            method:'POST',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        removecard: {
            url:'/api/dash/:dashId/cards',
            method:'DELETE',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        reposition_cards: {
            url:'/api/dash/:dashId/reposition',
            method:'POST',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        reordercards: {
            url:'/api/dash/:dashId/reorder',
            method:'POST',
            params:{dashId:'@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        subscribe: {
            url: '/api/dash/:dashId/subscribe',
            method: 'POST',
            params: {dashId: '@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }}
        },
        unsubscribe: {
            url: '/api/dash/:dashId/unsubscribe',
            method: 'POST',
            params: {dashId: '@dashId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }}
        }
    });
}]);

DashboardServices.factory('DashCard', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/dashcard/:id', {}, {
        resize: {
            url: '/api/dashcard/:id/resize',
            method: 'POST',
            params: { id:'@id' },
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        }
    });
}]);
