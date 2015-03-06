'use strict';
/*jslint browser:true*/
/*jslint devel:true */
/*global _*/
/*global $*/

// Global Controllers
var SuperAdminControllers = angular.module('superadmin.controllers', ['http-auth-interceptor']);

SuperAdminControllers.controller('SuperAdminBase', ['$scope', '$location', '$window', 'CorvusCore', 'CorvusAlert', 'User', function($scope, $location, $window, CorvusCore, CorvusAlert, User) {

    // make our utilities object available throughout the application
    $scope.utils = CorvusCore;

    $scope.alerts = CorvusAlert.alerts;

    //keep track of changes to the hash so we can update the UI accordingly (i.e. to show comments)
    $scope.$on("$locationChangeSuccess", function() {
        $scope.hash = $location.hash();
    });

    $scope.$on("event:auth-loginRequired", function() {
        $window.location.href = "/accounts/login/";
    });

    $scope.closeAlert = function(index) {
        CorvusAlert.closeAlert(index);
    };

    $scope.alertInfo = function(message) {
        CorvusAlert.alertInfo(message);
    };

    $scope.alertError = function(message) {
        CorvusAlert.alertError(message);
    };

    $scope.refreshCurrentUser = function() {
        // authentication check
        CorvusCore.currentUser(function (result) {
            if (result && !result.error) {
                $scope.user = result;
            } else {
                // TODO: error handling.  no user bject available.
                console.log(result);
            }
        }, function (error) {
            console.log('unable to get current user', error);
        });
    };

    // always refresh current user at page load
    $scope.refreshCurrentUser();
}]);
