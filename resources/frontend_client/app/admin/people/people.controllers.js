'use strict';
/*global _*/

var PeopleControllers = angular.module('corvusadmin.people.controllers', ['corvus.services', 'corvus.forms.directives']);

PeopleControllers.controller('PeopleList', ['$scope', '$routeParams', 'Organization', function($scope, $routeParams, Organization) {

    $scope.$watch('currentOrg', function (org) {
        if (!org) return;

        Organization.members({
            'orgId': org.id
        }, function (result) {
            $scope.people = result;
        }, function (error) {
            console.log('error', error);
        });

    });

    $scope.createdUser = function(newUser) {
        $scope.people.unshift(newUser);
    };

}]);


PeopleControllers.controller('PeopleEdit', ['$scope', '$routeParams', '$location', 'User', 'Organization', 'CorvusAlert',
    function($scope, $routeParams, $location, User, Organization, CorvusAlert) {

        $scope.grantAdmin = function() {
            if ($scope.user) {
                Organization.member_update({
                    orgId: $scope.currentOrg.id,
                    userId: $scope.user.id,
                    admin: true
                }, function (result) {
                    $scope.perm.admin = true;
                }, function (error) {
                    console.log('error', error);
                    $scope.alertError('failed to grant admin to user');
                });
            }
        };

        $scope.revokeAdmin = function() {
            if ($scope.user) {
                Organization.member_update({
                    orgId: $scope.currentOrg.id,
                    userId: $scope.user.id,
                    admin: false
                }, function (result) {
                    $scope.perm.admin = false;
                }, function (error) {
                    console.log('error', error);
                    $scope.alertError('failed to revoke admin from user');
                });
            }
        };

        $scope.removeMember = function() {
            if ($scope.user) {
                Organization.member_remove({
                    orgId: $scope.currentOrg.id,
                    userId: $scope.user.id
                }, function(result) {
                    $location.path('/'+$scope.currentOrg.slug+'/admin/people/');
                }, function (error) {
                    console.log('error', error);
                    $scope.alertError('failed to remove user from org');
                });
            }
        };

        $scope.submit = function() {
            User.update($scope.user, function (result) {
                CorvusAlert.alertInfo("Successfully updated!");
            }, function(errorResponse) {
                console.log(errorResponse);
                CorvusAlert.alertError("Error updating");
            });
        };

        $scope.$watch('currentOrg', function (org) {
            if(!org) return;

            if ($routeParams.userId) {
                Organization.member_get({
                    orgId: $scope.currentOrg.id,
                    userId: $routeParams.userId
                }, function (perm) {
                    $scope.perm = perm;
                    $scope.user = perm.user;
                }, function (error) {
                    console.log('error getting user', error);
                });
            }
        });
    }
]);


PeopleControllers.controller('PeopleChangePassword', ['$scope', '$routeParams', 'User', 'CorvusAlert', function($scope, $routeParams, User, CorvusAlert) {

    $scope.sendEmail = function(user) {
        User.send_password_reset_email({
            userId: user.id
        }, function(result) {
            CorvusAlert.alertInfo("password reset E-mail sent to " + user.email);
        }, function(errorResponse) {
            console.log("error while sending password reset email:");
            console.log(errorResponse.data);
            CorvusAlert.alertError("Error in sending reset E-mail to " + user.email);
        });
    };

    $scope.submit = function() {
        if($scope.password !== $scope.password_verify) {
            CorvusAlert.alertError("Passwords must match!");
            return;
        }

        User.update_password({
            id: $scope.user.id,
            password: $scope.password
        }, function (result) {
            CorvusAlert.alertInfo("Updated password!");
            console.log(result);
        }, function (error) {
            // Check for a specific error
            if(error.status==400 && error.data.password) {
                var errorText = error.data.password.join('.');
                CorvusAlert.alertError(errorText);

            } else{
                CorvusAlert.alertError("Error resetting password");
                console.log(error);
            }
        });
    };

    $scope.password = null;
    $scope.password_verify = null;

    if ($routeParams.userId) {
        User.get({
            userId: $routeParams.userId
        }, function (user) {
            $scope.user = user;
        }, function (error) {
            console.log('error getting user', error);
        });
    }
}]);
