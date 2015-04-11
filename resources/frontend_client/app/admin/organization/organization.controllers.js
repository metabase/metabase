"use strict";
/*global btoa*/
/*global $*/

var OrganizationAdminControllers = angular.module('corvusadmin.organization.controllers', ['corvus.services']);

OrganizationAdminControllers.controller('OrganizationSettings', ['$scope', 'Organization',
	function($scope, Organization) {

	    $scope.updateOrg = function(organization) {
	        Organization.update(organization, function (org) {
	            $scope.currentOrg = org;
	            $scope.alertInfo('Organization settings updated!');

	            // we need to trigger a refresh of $scope.user so that these changes propogate the UI
	            $scope.refreshCurrentUser();

	        }, function (error) {
	            console.log('error', error);
	            $scope.alertError('Update failed!');
	        });
	    };

	    Organization.form_input(function (result) {
	        $scope.form_input = result;
	    }, function (error) {
	        console.log('error getting form input', error);
	    });
	}
]);