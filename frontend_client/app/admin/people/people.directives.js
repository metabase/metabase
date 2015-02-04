'use strict';

var AdminPeopleDirectives = angular.module('corvusadmin.people.directives', []);

AdminPeopleDirectives.directive('cvAdminCreateUser', ['$modal', function ($modal) {
    function link(scope, element, attrs) {

        var openCreateUserAdminModal = function() {
            var modalInstance = $modal.open({
                templateUrl: '/app/admin/people/partials/modal_create_user.html',
                controller: ['$scope', '$modalInstance', 'CorvusAlert', 'Organization', 'CorvusFormService', 'organization', 'callback', function($scope, $modalInstance, CorvusAlert, Organization, CorvusFormService, organization, callback) {

                    $scope.alerts = CorvusAlert.alerts;
                    var formName = "createUserAdmin";
                    var submitSuccessMessage = "user created successfully";
                    var submitFailedMessage = "failed to create user";

                    $scope.newUser = {};
                    $scope.dialogStyle = {};

                    $scope.submit = function() {
                        $scope.newUser.orgId = organization.id;
                        Organization.member_create($scope.newUser, function(result) {
                            CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);
                            if (callback) {
                                callback(result);
                            }
                            $modalInstance.close(submitSuccessMessage);
                        }, function(errorResponse) {
                            CorvusFormService.submitFailedCallback(formName, errorResponse.data, submitFailedMessage);
                            CorvusAlert.alertError(submitFailedMessage);
                        });
                    };

                    $scope.close = function() {
                        $modalInstance.dismiss('cancel');
                    };
                }],

                resolve: {
                    organization: function() {
                        return scope.organization;
                    },
                    callback: function() {
                        return scope.callback;
                    }
                }
            });
        };

        element.click(openCreateUserAdminModal);

    }

    return {
        restrict: 'A',
        link: link,
        scope:{
            organization: '=',
            callback: '='
        }
    };

}]);

AdminPeopleDirectives.directive('cvAdminEditUser', ['$modal', '$timeout', function($modal, $timeout) {
    function link(scope, element, attrs) {

        var openEditUserAdminModal = function() {
            var modalInstance = $modal.open({
                templateUrl: '/app/admin/people/partials/modal_edit_user.html',
                controller: ['$scope', '$modalInstance', 'User', 'CorvusFormService', 'CorvusAlert', 'userToEdit', function($scope, $modalInstance, User, CorvusFormService, CorvusAlert, userToEdit) {
                    $scope.userToEdit = userToEdit;
                    var formName = "editUserAdmin";
                    var submitSuccessMessage = "user updated successfully";
                    var submitFailedMessage = "user update failed!";

                    $scope.submit = function() {
                        User.update($scope.userToEdit, function(result) {
                            CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);
                            CorvusAlert.alertInfo(submitSuccessMessage);
                            $modalInstance.close(submitSuccessMessage);
                        }, function(errorResponse) {
                            CorvusFormService.submitFailedCallback(formName, errorResponse.data, submitFailedMessage);
                        });
                    };

                    $scope.close = function() {
                        $modalInstance.dismiss('cancel');
                    };
                }],
                resolve: {
                    userToEdit: function() {
                        return scope.userToEdit;
                    }
                }
            });

            modalInstance.result.then(function(result) {
                //modal closed
            }, function(reason) {
                //modal dismissed
            });

        };

        element.click(openEditUserAdminModal);

    }

    return {
        restrict: 'A',
        link: link,
        scope:{
            userToEdit: '='
        }
    };
}]);

AdminPeopleDirectives.directive('cvAdminEditPassword', ['$modal', '$timeout', function($modal, $timeout) {
    function link(scope, element, attrs) {

        var openEditUserAdminModal = function() {
            var modalInstance = $modal.open({
                templateUrl: '/app/admin/people/partials/modal_edit_password.html',
                controller: ['$scope', '$modalInstance', 'User', 'CorvusFormService', 'CorvusAlert', 'userToEdit', function($scope, $modalInstance, User, CorvusFormService, CorvusAlert, userToEdit) {
                    $scope.userToEdit = userToEdit;
                    var formName = "editPasswordAdmin";
                    var submitSuccessMessage = "password updated successfully";
                    var submitFailedMessage = "password update failed!";

                    $scope.resetCallback = function() {
                        var corvusFormController = CorvusFormService.getFormController(formName);
                        corvusFormController.form.password_verify.$viewValue = '';
                        corvusFormController.form.password_verify.$modelValue = '';
                        corvusFormController.form.password_verify.$setValidity('password_verify', true);
                        $scope.$apply();
                    };

                    $scope.submit = function() {
                        User.update_password($scope.userToEdit, function(result) {
                            CorvusFormService.submitSuccessCallback(formName, submitSuccessMessage);
                            $modalInstance.close(submitSuccessMessage);
                            CorvusAlert.alertInfo(submitSuccessMessage);
                        }, function(errorResponse) {
                            CorvusFormService.submitFailedCallback(formName, errorResponse.data, submitFailedMessage);
                        });
                    };

                    $scope.close = function() {
                        $modalInstance.dismiss('cancel');
                    };
                }],
                resolve: {
                    userToEdit: function() {
                        return scope.userToEdit;
                    }
                }
            });

            modalInstance.result.then(function(result) {
                //modal closed
            }, function(reason) {
                //modal dismissed
            });

        };

        element.click(openEditUserAdminModal);

    }

    return {
        restrict: 'A',
        link: link,
        scope:{
            userToEdit: '='
        }
    };
}]);


AdminPeopleDirectives.directive('cvSendPasswordResetEmail', function(User, CorvusAlert) {
    function controller($scope, $element) {
        $scope.sendEmail = function(user) {
            User.send_password_reset_email({
                userId: user.id
            }, function(result) {
                $scope.close();
                CorvusAlert.alertInfo("password reset E-mail sent to " + user.email);
            }, function(errorResponse) {
                console.log("error while sending password reset email:");
                console.log(errorResponse.data);
                throw "An unknown error occurred while trying to send password reset email (see logs)";
            });
        };
    }

    return {
        restrict: 'A',
        controller: controller
    };
});
