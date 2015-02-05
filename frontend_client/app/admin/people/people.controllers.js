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
