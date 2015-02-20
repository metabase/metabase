'use strict';
/*jslint browser:true*/
/*jslint devel:true */
/*global _*/
/*global $*/

// Global Controllers
var CorvusControllers = angular.module('corvus.controllers', ['http-auth-interceptor', 'corvus.services']);

CorvusControllers.controller('Corvus', ['$scope', '$location', '$window', 'CorvusCore', 'CorvusAlert', 'AppState', function($scope, $location, $window, CorvusCore, CorvusAlert, AppState) {

    // make our utilities object available throughout the application
    $scope.utils = CorvusCore;

    // current User
    $scope.user = undefined;

    // current Organization
    $scope.currentOrgSlug = undefined;
    $scope.currentOrg = undefined;

    $scope.alerts = CorvusAlert.alerts;
    $scope.navShowing = false;

    //keep track of changes to the hash so we can update the UI accordingly (i.e. to show comments)
    $scope.$on("$locationChangeSuccess", function() {
        $scope.hash = $location.hash();
        $scope.navShowing = false;
    });

    $scope.$on("event:auth-loginRequired", function() {
        $window.location.href = "/accounts/login/";
    });

    $scope.$on("appstate:user", function (event, user) {
        // change in current user
        $scope.user = user;
    });

    $scope.$on("appstate:organization", function (event, org) {
        // change in current organization
        $scope.currentOrgSlug = org.slug;
        $scope.currentOrg = org;
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

    $scope.changeCurrOrg = function(orgSlug) {
        $location.path('/'+orgSlug+'/');
    };

    $scope.refreshCurrentUser = function() {
        AppState.refreshCurrentUser();
    };
}]);


CorvusControllers.controller('SearchBox', ['$scope', '$location', function($scope, $location) {

    $scope.submit = function () {
        $location.path('/' + $scope.currentOrgSlug + '/search').search({q: $scope.searchText});
    };

}]);


CorvusControllers.controller('Unauthorized', ['$scope', '$location', function($scope, $location) {

}]);
