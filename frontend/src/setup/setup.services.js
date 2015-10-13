var SetupServices = angular.module('metabase.setup.services', ['ngResource', 'ngCookies']);

SetupServices.factory('Setup', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/setup/', {}, {
        create: {
            method: 'POST'
        },

        validate_db: {
            url: '/api/setup/validate',
            method: 'POST'
        }
    });
}]);

