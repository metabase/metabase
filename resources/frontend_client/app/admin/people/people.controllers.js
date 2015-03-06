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

    $scope.grantAdmin = function(index) {
        if ($scope.people) {
            console.log('grant');
            Organization.member_update({
                'orgId': $scope.currentOrg.id,
                'userId': $scope.people[index].user.id,
                'admin': true
            }, function (result) {
                $scope.people[index].admin = true;
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to grant admin to user');
            });
        }
    };

    $scope.revokeAdmin = function(index) {
        if ($scope.people) {
            Organization.member_update({
                'orgId': $scope.currentOrg.id,
                'userId': $scope.people[index].user.id,
                'admin': false
            }, function(result) {
                $scope.people[index].admin = false;
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to revoke admin from user');
            });
        }
    };

    $scope.removeMember = function(userId) {
        if ($scope.people) {
            Organization.member_remove({
                'orgId': $scope.currentOrg.id,
                'userId': userId
            }, function(result) {
                $scope.people = _.filter($scope.people, function(perm){
                    return perm.user.id != userId;
                });
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to remove user from org');
            });
        }
    };

}]);


PeopleControllers.controller('PeopleView', ['$scope', '$routeParams', 'User', 'CorvusAlert', function($scope, $routeParams, User, CorvusAlert) {
        if ($routeParams.userId) {
            $scope.user = User.get({userId:$routeParams.userId});
        }
        $scope.password = null;
        $scope.password_verify = null;
        
        $scope.submit = function() {
            User.update($scope.user, function(result) {
                CorvusAlert.alertInfo("Successfully updated!");
            }, function(errorResponse) {
                console.log(errorResponse);
                CorvusAlert.alertError("Error updating");
            });
        };

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

        $scope.resetPassword = function(){
            if($scope.password != $scope.password_verify){
                CorvusAlert.alertError("Passwords must match!");
                return;
            }
            User.update_password({'id': $scope.user.id, 'password': $scope.password}, function(result) {
                CorvusAlert.alertInfo("Updated password!");
                console.log(result);
            }, function(errorResponse) {
                // Check for a specific error
                if(errorResponse.status==400 && errorResponse.data.password){
                    var errorText = errorResponse.data.password.join('.');
                    CorvusAlert.alertError(errorText);

                }else{
                    CorvusAlert.alertError("Error resetting password");
                    console.log(errorResponse);
                }
            });
        };


}]);