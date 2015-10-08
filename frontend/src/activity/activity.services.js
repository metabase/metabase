var ActivityServices = angular.module('metabase.activity.services', ['ngResource', 'ngCookies']);

ActivityServices.factory('Activity', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/activity', {}, {
        list: {
            method: 'GET',
            isArray: true
        },

        recent_views: {
            url: '/api/activity/recent_views',
            method: 'GET',
            isArray: true
        }
    });
}]);
