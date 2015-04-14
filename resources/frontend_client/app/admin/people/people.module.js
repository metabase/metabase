'use strict';

var Organization = angular.module('corvusadmin.people', [
    'corvusadmin.people.controllers',
    'corvusadmin.people.directives'
]);

Organization.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/people/', {
        templateUrl: '/app/admin/people/partials/people.html',
        controller: 'PeopleList'
    });
}]);
