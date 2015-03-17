'use strict';

var SettingsAdmin = angular.module('superadmin.organization', ['superadmin.organization.controllers']);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/superadmin/organization/', {
        templateUrl: '/app/superadmin/organization/partials/org_list.html',
        controller: 'OrganizationListController'
    });

    $routeProvider.when('/superadmin/organization/create', {
        templateUrl: '/app/superadmin/organization/partials/org_detail.html',
        controller: 'OrganizationDetailController'
    });

    $routeProvider.when('/superadmin/organization/:orgId', {
        templateUrl: '/app/superadmin/organization/partials/org_detail.html',
        controller: 'OrganizationDetailController'
    });
}]);
