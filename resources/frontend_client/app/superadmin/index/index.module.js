'use strict';

// Admin
var SuperAdminIndex = angular.module('superadmin.index', ['superadmin.index.controllers']);

SuperAdminIndex.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/superadmin/',
        {
            templateUrl: '/app/superadmin/index/partials/index.html',
            controller: 'SuperAdminIndex'
        }
    );
}]);
