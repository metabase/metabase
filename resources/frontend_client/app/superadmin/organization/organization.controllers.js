'use strict';
/*global _*/

var OrganizationControllers = angular.module('superadmin.organization.controllers', ['corvus.services',
    'superadmin.index.services'
]);

OrganizationControllers.controller('OrganizationListController', ['$scope', 'Organization', 'SettingsAdminServices',

    function($scope, Organization, SettingsAdminServices) {
        $scope.organizations = [];

        $scope.saveSetting = function(setting) {
            SettingsAdminServices.put({
                key: setting.key
            }, setting, function() {
                setting.originalValue = setting.value;
            }, function(error) {
                console.log("Error saving setting: ", error);
            });
        };

        $scope.deleteSetting = function(setting) {
            SettingsAdminServices.delete({
                key: setting.key
            }, function() {
                setting.value = null;
                setting.originalValue = null;
            }, function(error) {
                console.log("Error deleting setting: ", error);
            });
        };

        // initialize on load
        Organization.list(function(orgs) {
            $scope.organizations = orgs;
        }, function(error) {
            console.log("Error getting organizations: ", error);
        });

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
                },
                function(org) {
                    $scope.organization = org;
                },
                function(error) {
                    console.log("Error getting organization: ", error);
                    // TODO - should be a 404 response
                });

            // provide a relevant save() function
            $scope.save = function(organization) {
                Organization.update(organization, function(org) {
                    $scope.organization = org;
                }, function(error) {
                    console.log(error);
                });
            };

        } else {
            // assume we are creating a new org
            $scope.organization = {};

            // provide a relevant save() function
            $scope.save = function(organization) {
                // TODO - some simple validation checks

                Organization.create(organization,
                    function(org) {
                        $location.path('/superadmin/organization/' + org.id);
                    },
                    function(error) {
                        console.log(error);
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
