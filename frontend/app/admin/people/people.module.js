var AdminPeople = angular.module('metabaseadmin.people', [
    'metabaseadmin.people.controllers'
]);

AdminPeople.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/people/', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: 'PeopleList'
    });
}]);
