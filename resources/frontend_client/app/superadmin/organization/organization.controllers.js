'use strict';
/*global _*/

var OrganizationControllers = angular.module('superadmin.organization.controllers', [
    'corvus.services',
    'metabase.forms'
]);

OrganizationControllers.controller('OrganizationListController', ['$scope', 'Organization',
    function($scope, Organization) {

        $scope.deleteOrganization = function(organization) {
            Organization.delete({
                orgId: organization.id
            }, function() {
                $scope.organizations = _.filter($scope.organizations, function(org) {
                    return org.id !== organization.id;
                });
            }, function(err) {
                console.log("Error deleting Org:", err);
            });
        };

        $scope.organizations = [];

        // initialize on load
        Organization.list(function(orgs) {
            $scope.organizations = orgs;
        }, function(error) {
            console.log("Error getting organizations: ", error);
        });
    }
]);

OrganizationControllers.controller('OrganizationDetailController', ['$scope', '$routeParams', '$location', 'Organization',
    function($scope, $routeParams, $location, Organization) {

        $scope.organization = undefined;

        // initialize on load
        if ($routeParams.orgId) {
            // editing an existing organization
            Organization.get({
                'orgId': $routeParams.orgId
            }, function (org) {
                $scope.organization = org;
            }, function (error) {
                console.log("Error getting organization: ", error);
                // TODO - should be a 404 response
            });

            // provide a relevant save() function
            $scope.save = function(organization) {
                $scope.$broadcast("form:reset");
                Organization.update(organization, function (org) {
                    $scope.organization = org;
                    $scope.$broadcast("form:api-success", "Successfully saved!");
                }, function (error) {
                    $scope.$broadcast("form:api-error", error);
                });
            };

        } else {
            // assume we are creating a new org
            $scope.organization = {};

            // provide a relevant save() function
            $scope.save = function(organization) {
                $scope.$broadcast("form:reset");
                Organization.create(organization, function (org) {
                    $scope.$broadcast("form:api-success", "Successfully saved!");
                    $location.path('/superadmin/organization/' + org.id);
                }, function (error) {
                    $scope.$broadcast("form:api-error", error);
                });
            };
        }

        // always get our form input
        Organization.form_input(function (result) {
            $scope.form_input = result;
        }, function (error) {
            console.log('error getting form input', error);
        });
    }
]);
