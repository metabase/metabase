"use strict";
/*global btoa*/
/*global $*/

var OrganizationAdminControllers = angular.module('corvusadmin.organization.controllers', [
	'corvus.services',
	'metabase.forms'
]);

OrganizationAdminControllers.controller('OrganizationSettings', ['$scope', 'Organization', 'MetabaseForm',
	function($scope, Organization, MetabaseForm) {

		var formFields = {
            name: 'name',
            description: 'description',
            logo_url: 'logo_url'
        };

	    $scope.save = function(organization) {
	    	MetabaseForm.clearFormErrors($scope.form, formFields);
	    	$scope.form.$setPristine();
	    	//$scope.form.$setUntouched();

	        Organization.update(organization, function (org) {
	            $scope.currentOrg = org;
	            $scope.alertInfo('Organization settings updated!');

	            // we need to trigger a refresh of $scope.user so that these changes propogate the UI
	            $scope.refreshCurrentUser();

	        }, function (error) {
	        	MetabaseForm.parseFormErrors($scope.form, formFields, error);
	        });
	    };

	    Organization.form_input(function (result) {
	        $scope.form_input = result;
	    }, function (error) {
	        console.log('error getting form input', error);
	    });
	}
]);