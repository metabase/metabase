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
                        $scope.newUser.admin = false;
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
