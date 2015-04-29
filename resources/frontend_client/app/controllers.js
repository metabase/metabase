'use strict';
/*jslint browser:true*/
/*jslint devel:true */
/*global _*/
/*global $*/

// Global Controllers
var CorvusControllers = angular.module('corvus.controllers', ['corvus.services', 'corvus.navbar.directives']);

CorvusControllers.controller('Corvus', ['$scope', '$location', 'CorvusCore', 'CorvusAlert', 'AppState', function($scope, $location, CorvusCore, CorvusAlert, AppState) {

    var clearState = function() {
        $scope.user = undefined;
        $scope.userIsAdmin = false;
        $scope.userIsSuperuser = false;
        $scope.currentOrgSlug = undefined;
        $scope.currentOrg = undefined;
    };

    // make our utilities object available throughout the application
    $scope.utils = CorvusCore;

    // current User
    // TODO: can we directly bind to Appstate.model?
    $scope.user = undefined;
    $scope.userMemberOf = undefined;
    $scope.userAdminOf = undefined;
    $scope.userIsAdmin = false;
    $scope.userIsSuperuser = false;

    // current Organization
    // TODO: can we directly bind to Appstate.model?
    $scope.currentOrgSlug = undefined;
    $scope.currentOrg = undefined;

    $scope.alerts = CorvusAlert.alerts;

    $scope.$on("appstate:user", function(event, user) {
        // change in current user
        $scope.user = user;
        $scope.userMemberOf = user.memberOf();
        $scope.userAdminOf = user.adminOf();
        $scope.userIsSuperuser = user.is_superuser;
    });

    $scope.$on("appstate:organization", function(event, org) {
        // change in current organization
        $scope.currentOrgSlug = org.slug;
        $scope.currentOrg = org;
        $scope.userIsAdmin = $scope.user.isAdmin(org.slug);
    });

    $scope.$on("appstate:logout", function(event, user) {
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

    $scope.changeCurrOrg = function(orgSlug, admin) {
        if (admin) {
            $location.path('/' + orgSlug + '/admin/');
        } else {
            $location.path('/' + orgSlug + '/');
        }
    };

    $scope.refreshCurrentUser = function() {
        AppState.refreshCurrentUser();
    };
}]);


CorvusControllers.controller('Homepage', ['$scope', '$location', 'ipCookie', 'AppState',
    function($scope, $location, ipCookie, AppState) {

        // At this point in time we don't actually have any kind of content to show for a homepage, so we just use this
        // as a simple routing controller which sends users somewhere relevant
        if (AppState.model.currentUser) {
            var currentUser = AppState.model.currentUser;

            // We have a logged-in user, so send them somewhere sensible
            var currentOrgFromCookie = ipCookie('metabase.CURRENT_ORG');

            if (AppState.model.currentOrgSlug) {
                // we know their current org
                $location.path('/' + AppState.model.currentOrgSlug + '/');

            } else if (currentOrgFromCookie && currentUser.isMember(currentOrgFromCookie)) {
                // cookie is telling us their last current org
                $location.path('/' + currentOrgFromCookie + '/');

            } else if (currentUser.memberOf().length > 0) {
                // no other indicator, so simply take the first org they have permissions on
                $location.path('/' + currentUser.memberOf()[0].slug + '/');

            } else {
                // user doesn't have perms on any orgs, so they go somewhere neutral
                $location.path('/user/edit_current');
            }
        } else {
            // User is not logged-in, so always send them to login page
            $location.path('/auth/login');
        }

    }
]);


CorvusControllers.controller('Unauthorized', ['$scope', '$location', function($scope, $location) {

}]);


CorvusControllers.controller('Nav', ['$scope', '$routeParams', '$location', 'AppState', function($scope, $routeParams, $location, AppState) {

    $scope.activeClass = 'is--selected';

    $scope.isActive = function(location) {
        return $location.path().indexOf(location) >= 0;
    };

    var setNavContext = function(context) {
        switch (context) {
            case "site-admin":
                $scope.nav = 'superadmin';
                break;
            case "setup":
                $scope.nav = 'setup';
                break;
            case "org-admin":
                $scope.nav = 'admin';
                break;
            default:
                $scope.nav = 'main';
        }
    };

    $scope.$on('appstate:context-changed', function(event, newAppContext) {
        setNavContext(newAppContext);
    });

    // initialize our state from the current AppState model, which we expect to have resolved already
    setNavContext(AppState.model.appContext);
}]);
