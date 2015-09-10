'use strict';

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

MetabaseControllers.controller('Nav', ['$scope', '$routeParams', '$location', 'AppState', function($scope, $routeParams, $location, AppState) {

    $scope.isActive = function(location) {
        return $location.path().indexOf(location) >= 0;
    };

    var setNavContext = function(context) {
        switch (context) {
            case "admin":
                $scope.nav = 'admin';
                break;
            case "setup":
                $scope.nav = 'setup';
                break;
            case "auth":
                $scope.nav = 'auth';
                break;
            case "none":
                $scope.nav = 'none';
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
