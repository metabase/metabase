'use strict';
/*jslint browser:true*/
/*jslint devel:true */
/*global _*/
/*global $*/

// Global Controllers
var CorvusControllers = angular.module('corvus.controllers', ['corvus.services']);

CorvusControllers.controller('Corvus', ['$scope', '$location', 'CorvusCore', 'CorvusAlert', 'AppState', function($scope, $location, CorvusCore, CorvusAlert, AppState) {

    var clearState = function() {
        $scope.user = undefined;
        $scope.userIsAdmin = false;
        $scope.currentOrgSlug = undefined;
        $scope.currentOrg = undefined;
    };

    // make our utilities object available throughout the application
    $scope.utils = CorvusCore;

    // current User
    // TODO: can we directly bind to Appstate.model?
    $scope.user = undefined;
    $scope.userIsAdmin = false;

    // current Organization
    // TODO: can we directly bind to Appstate.model?
    $scope.currentOrgSlug = undefined;
    $scope.currentOrg = undefined;

    $scope.alerts = CorvusAlert.alerts;

    $scope.$on("appstate:user", function (event, user) {
        // change in current user
        $scope.user = user;
    });

    $scope.$on("appstate:organization", function (event, org) {
        // change in current organization
        $scope.currentOrgSlug = org.slug;
        $scope.currentOrg = org;
        $scope.userIsAdmin = AppState.userIsAdmin();
    });

    $scope.$on("appstate:logout", function (event, user) {
        clearState();
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

    $scope.memberOf = function(){
        return AppState.memberOf();
    };

    $scope.adminOf = function(){
        return AppState.adminOf();
    };
}]);


CorvusControllers.controller('SearchBox', ['$scope', '$location', function($scope, $location) {

    $scope.submit = function () {
        $location.path('/' + $scope.currentOrgSlug + '/search').search({q: $scope.searchText});
    };

}]);


CorvusControllers.controller('Unauthorized', ['$scope', '$location', function($scope, $location) {

}]);


CorvusControllers.controller('Nav', ['$scope', '$routeParams', '$location', function($scope, $routeParams, $location) {
    $scope.nav = 'main'
    $scope.$on('$routeChangeSuccess', function () {
        if($routeParams.orgSlug && $location.path().indexOf('admin') > 0) {
            $scope.nav = 'admin'
        } else if ($location.path().indexOf('setup') >0 ) {
            $scope.nav = 'setup'
        } else {
            $scope.nav = 'main'
        }
    });
}]);
