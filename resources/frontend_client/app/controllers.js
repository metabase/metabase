'use strict';

import Navbar from 'metabase/components/Navbar.react';


// Global Controllers
var MetabaseControllers = angular.module('metabase.controllers', ['metabase.services', 'metabase.navbar.directives']);

MetabaseControllers.controller('Metabase', ['$scope', '$location', 'MetabaseCore', 'AppState', function($scope, $location, MetabaseCore, AppState) {

    var clearState = function() {
        $scope.siteName = undefined;
        $scope.user = undefined;
        $scope.userIsSuperuser = false;
    };

    // make our utilities object available throughout the application
    $scope.utils = MetabaseCore;

    // current User
    $scope.user = undefined;
    $scope.userIsSuperuser = false;

    $scope.$on("appstate:site-settings", function(event, settings) {
        // change in global settings
        $scope.siteName = settings['site-name'].value;
    });

    $scope.$on("appstate:user", function(event, user) {
        // change in current user
        $scope.user = user;
        $scope.userIsSuperuser = user.is_superuser;
    });

    $scope.$on("appstate:logout", function(event, user) {
        clearState();
    });

    $scope.refreshCurrentUser = function() {
        AppState.refreshCurrentUser();
    };
}]);


MetabaseControllers.controller('Unauthorized', ['$scope', '$location', function($scope, $location) {

}]);

MetabaseControllers.controller('NotFound', ['AppState', function(AppState) {
    AppState.setAppContext('none');
}]);

MetabaseControllers.controller('Nav', ['$scope', '$routeParams', '$location', '$rootScope', 'AppState', 'Dashboard',
    function($scope, $routeParams, $location, $rootScope, AppState, Dashboard) {

        function refreshDashboards() {
            Dashboard.list({
                'filterMode': 'all'
            }, function (dashes) {
                $scope.dashboards = dashes;
            }, function (error) {
                console.log('error getting dahsboards list', error);
            });
        }

        function setNavContext(context) {
            switch (context) {
                case "admin":
                    $scope.context = 'admin';
                    break;
                case "setup":
                    $scope.context = 'setup';
                    break;
                case "auth":
                    $scope.context = 'auth';
                    break;
                case "none":
                    $scope.context = 'none';
                    break;
                default:
                    $scope.context = 'main';
            }
        }

        $scope.Navbar = Navbar;
        $scope.location = $location;

        $scope.dashboards = [];
        $scope.createDashboardFn = async function(newDashboard) {
            var dashboard = await Dashboard.create(newDashboard).$promise;
            $rootScope.$broadcast("dashboard:create", dashboard.id);
            $location.path("/dash/" + dashboard.id);

            // this is important because it allows our caller to perform any of their own actions after the promis resolves
            return dashboard;
        };

        $scope.$on('appstate:context-changed', function(event, newAppContext) {
            setNavContext(newAppContext);
        });

        $scope.$on("dashboard:create", function(event, dashboardId) {
            refreshDashboards();
        });

        $scope.$on("dashboard:delete", function(event, dashboardId) {
            refreshDashboards();
        });

        $scope.$on("dashboard:update", function(event, dashboardId) {
            refreshDashboards();
        });

        // always initialize with a fresh listing
        refreshDashboards();

        // initialize our state from the current AppState model, which we expect to have resolved already
        setNavContext(AppState.model.appContext);
    }
]);
