"use strict";
/*global btoa*/
/*global $*/

var OrganizationAdminControllers = angular.module('corvusadmin.organization.controllers', [
	'corvus.services',
	'metabase.forms'
]);

OrganizationAdminControllers.controller('OrganizationSettings', ['$scope', 'Organization',
	function($scope, Organization) {

	    $scope.save = function(organization) {
	    	$scope.$broadcast("form:reset");

	    	// use NULL for unset timezone
	    	if (!organization.report_timezone) {
	    		organization.report_timezone = null;
	    	}

	        Organization.update(organization, function (org) {
	            $scope.currentOrg = org;
	            $scope.$broadcast("form:api-success", "Successfully saved!");

	            // we need to trigger a refresh of $scope.user so that these changes propogate the UI
	            $scope.refreshCurrentUser();

	        }, function (error) {
	        	$scope.$broadcast("form:api-error", error);
	        });
	    };

	    Organization.form_input(function (result) {
	        $scope.form_input = result;
	    }, function (error) {
	        console.log('error getting form input', error);
	    });
	}
]);