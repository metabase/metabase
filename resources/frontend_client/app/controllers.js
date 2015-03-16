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
    $scope.userMemberOf = undefined;
    $scope.userAdminOf = undefined;
    $scope.userIsAdmin = false;

    // current Organization
    // TODO: can we directly bind to Appstate.model?
    $scope.currentOrgSlug = undefined;
    $scope.currentOrg = undefined;

    $scope.alerts = CorvusAlert.alerts;

    $scope.$on("appstate:user", function (event, user) {
        // change in current user
        $scope.user = user;
        $scope.userMemberOf = user.memberOf();
        $scope.userAdminOf = user.adminOf();
    });

    $scope.$on("appstate:organization", function (event, org) {
        // change in current organization
        $scope.currentOrgSlug = org.slug;
        $scope.currentOrg = org;
        $scope.userIsAdmin = $scope.user.isAdmin(org.slug);
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
}]);


CorvusControllers.controller('Homepage', ['$scope', '$location', 'ipCookie', 'AppState',
    function($scope, $location, ipCookie, AppState) {

        // At this point in time we don't actually have any kind of content to show for a homepage, so we just use this
        // as a simple routing controller which sends users somewhere relevant
        if(AppState.model.currentUser) {
            // We have a logged-in user, so send them somewhere sensible
            var currentOrgFromCookie = ipCookie('metabase.CURRENT_ORG');

            if(AppState.model.currentOrgSlug) {
                // we know their current org, so just send them there
                $location.path('/'+AppState.model.currentOrgSlug+'/');

            } else if(currentOrgFromCookie && AppState.model.currentUser.org_perms && AppState.model.currentUser.org_perms.length > 0) {
                // check to see if the user has perms on the org set in their cookie
                var orgsWithSlug = AppState.model.currentUser.org_perms.filter(function(org_perm) {
                    return org_perm.organization.slug == currentOrgFromCookie;
                });

                if (orgsWithSlug.length > 0) {
                    // cookie is telling us their last current org, so lets send them there
                    $location.path('/'+orgsWithSlug[0].organization.slug+'/');
                } else {
                    // user doesn't seem to have permissions on their last current org, so just send them to one of their orgs
                    $location.path('/'+AppState.model.currentUser.org_perms[0].organization.slug+'/');
                    ipCookie.remove('metabase.CURRENT_ORG');
                }
            } else if(AppState.model.currentUser.org_perms && AppState.model.currentUser.org_perms.length > 0) {
                // there is no cookie set, so simply take the first org they have permissions on and send them there
                $location.path('/'+AppState.model.currentUser.org_perms[0].organization.slug+'/');
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
        } else if ($location.path().indexOf('superadmin') >0 ) {
            $scope.nav = 'superadmin'
        } else {
            $scope.nav = 'main'
        }
    });
}]);
