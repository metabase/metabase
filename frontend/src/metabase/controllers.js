
angular
.module('metabase.controllers', ['metabase.services'])
.controller('Metabase', ['$scope', '$location', 'AppState', function($scope, $location, AppState) {

    var clearState = function() {
        $scope.siteName = undefined;
        $scope.user = undefined;
        $scope.userIsSuperuser = false;
    };

    // current User
    $scope.user = undefined;
    $scope.userIsSuperuser = false;

    $scope.$on("appstate:site-settings", function(event, settings) {
        // change in global settings
        $scope.siteName = settings.site_name;
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
