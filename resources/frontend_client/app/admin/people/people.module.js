'use strict';

var Organization = angular.module('corvusadmin.people', [
    'corvusadmin.people.controllers'
]);

Organization.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/people/', {
        templateUrl: '/app/admin/people/partials/people.html',
        controller: 'PeopleList'
    });

    $routeProvider.when('/:orgSlug/admin/people/add', {
        templateUrl: '/app/admin/people/partials/people_add.html',
        controller: 'PeopleAdd'
    });
}]);
