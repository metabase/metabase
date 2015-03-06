"use strict";

var UserControllers = angular.module('corvus.user.controllers', ['corvus.forms.directives']);

UserControllers.controller('AccountSettingsController', ['$scope', 'User', 'CorvusCore', 'CorvusFormService', function($scope, User, CorvusCore, CorvusFormService) {
    var _self = this;
    var formName = "accountSettings";
    CorvusCore.currentUser(function(result) {
        if (result && !result.error) {
            _self.accountSettingsUser = result;
        }
    });

    this.submit = function() {
        var submitSuccessMessage = "user updated successfully";
        var submitFailedMessage = "user update failed!";

        User.update(_self.accountSettingsUser, function(result) {
            CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);

            // it's possible the user changed their name, so refresh our current user model
            $scope.refreshCurrentUser();

        }, function(errorResponse) {
            CorvusFormService.submitFailedCallback(formName, errorResponse.data, submitFailedMessage);
        });
    };
}]);

UserControllers.controller('PasswordUpdateController', ['$scope', 'User', 'CorvusCore', 'CorvusFormService', function($scope, User, CorvusCore, CorvusFormService) {
    var _self = this;
    var formName = "passwordEdit";

    CorvusCore.currentUser(function(result) {
        if (result && !result.error) {
            _self.passwordEditUser = result;
        }
    });

    this.resetCallback = function() {
        var corvusFormController = CorvusFormService.getFormController(formName);
        corvusFormController.form.password_verify.$viewValue = '';
        corvusFormController.form.password_verify.$modelValue = '';
        corvusFormController.form.password_verify.$setValidity('password_verify', true);
        $scope.$apply();
    };

    this.submit = function() {
        var submitSuccessMessage = "password updated successfully";
        var submitFailedMessage = "password update failed!";

        User.update_password(_self.passwordEditUser, function(result) {
            CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);
        }, function(errorResponse) {
            CorvusFormService.submitFailedCallback(formName, errorResponse.data, submitFailedMessage);
        });
    };
}]);

UserControllers.controller('EditCurrentUser', ['$scope', function($scope) {
    $scope.tab_focus = 'details';

    $scope.setTabFocus = function (tab) {
        $scope.tab_focus = tab;
    };
}]);
