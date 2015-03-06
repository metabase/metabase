'use strict';

var Organization = angular.module('corvusadmin.people', [
    'corvusadmin.people.controllers',
    'corvusadmin.people.directives'
]);

Organization.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.otherwise({redirectTo: '/:orgSlug/admin/'});
    $routeProvider.when('/:orgSlug/admin/people/', {
        templateUrl: '/app/admin/people/partials/people.html',
        controller: 'PeopleList'
    });
    $routeProvider.when('/:orgSlug/admin/people/:userId/modify', {
        templateUrl: '/app/admin/people/partials/user_edit.html',
        controller: 'PeopleView'
    });

    $routeProvider.when('/:orgSlug/admin/people/:userId/change_password', {
        templateUrl: '/app/admin/people/partials/user_password_edit.html',
        controller: 'PeopleView'
    });

}]);
