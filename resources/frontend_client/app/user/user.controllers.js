"use strict";

var UserControllers = angular.module('corvus.user.controllers', ['metabase.forms']);

UserControllers.controller('EditCurrentUser', ['$scope', function($scope) {
    $scope.tab_focus = 'details';

    $scope.setTabFocus = function (tab) {
        $scope.tab_focus = tab;
    };
}]);


UserControllers.controller('AccountSettingsController', ['$scope', 'User',
    function($scope, User) {

        $scope.save = function(updateUser) {
            $scope.$broadcast("form:reset");

            User.update(updateUser, function (result) {
                $scope.$broadcast("form:api-success", "Account updated successfully!");

                // it's possible the user changed their name, so refresh our current user model
                $scope.refreshCurrentUser();

            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };

        // always use the currently logged in user
        $scope.editUser = angular.copy($scope.user);
    }
]);


UserControllers.controller('PasswordUpdateController', ['$scope', 'User',
    function($scope, User) {

        $scope.save = function(passwordDetails) {
            $scope.$broadcast("form:reset");

            // check that confirm password matches new password
            if (passwordDetails.password !== passwordDetails.password2) {
                $scope.$broadcast("form:api-error", {'data': {'errors': {'password2': "Passwords do not match"}}});
                return;
            }

            User.update_password({
                'id': $scope.user.id,
                'password': passwordDetails.password,
                'old_password': passwordDetails.old_password
            }, function (result) {
                $scope.$broadcast("form:api-success", "Password updated successfully!");

            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };

        $scope.passwordDetails = {};
    }
]);
