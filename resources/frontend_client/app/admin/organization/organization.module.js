'use strict';

var OrganizationAdmin = angular.module('corvusadmin.organization', [
    'corvusadmin.organization.controllers'
]);

OrganizationAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/org/', {
        templateUrl: '/app/admin/organization/partials/org_settings.html',
        controller: 'OrganizationSettings'
    });
}]);