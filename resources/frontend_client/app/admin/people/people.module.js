'use strict';

var AdminPeople = angular.module('corvusadmin.people', [
    'corvusadmin.people.controllers'
]);

AdminPeople.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/people/', {
        templateUrl: '/app/admin/people/partials/people.html',
        controller: 'PeopleList'
    });

    $routeProvider.when('/admin/people/add', {
        templateUrl: '/app/admin/people/partials/people_add.html',
        controller: 'PeopleAdd'
    });
}]);
