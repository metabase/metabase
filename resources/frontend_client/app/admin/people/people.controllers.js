'use strict';
/*global _*/

var PeopleControllers = angular.module('corvusadmin.people.controllers', [
    'corvus.services',
    'metabase.forms'
]);

PeopleControllers.controller('PeopleList', ['$scope', 'Organization',
    function($scope, Organization) {

        // grant admin permission for a given user
        var grant = function(userId) {
            Organization.member_update({
                orgId: $scope.currentOrg.id,
                userId: userId,
                admin: true
            }, function (result) {
                $scope.people.forEach(function (perm) {
                    if (perm.user.id === userId) {
                        perm.admin = true;
                    }
                });
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to grant admin to user');
            });
        };

        // revoke admin permission for a given user
        var revoke = function(userId) {
            Organization.member_update({
                orgId: $scope.currentOrg.id,
                userId: userId,
                admin: false
            }, function (result) {
                $scope.people.forEach(function (perm) {
                    if (perm.user.id === userId) {
                        perm.admin = false;
                    }
                });
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to revoke admin from user');
            });
        };

        // toggle admin permission for a given user
        $scope.toggle = function(userId) {
            $scope.people.forEach(function (perm) {
                if (perm.user.id === userId) {
                    if (perm.admin) {
                        revoke(userId);
                    } else {
                        grant(userId);
                    }
                }
            });
        };

        // completely remove a given user (from the current org)
        $scope.delete = function(userId) {
            Organization.member_remove({
                orgId: $scope.currentOrg.id,
                userId: userId
            }, function(result) {
                for (var i = 0; i < $scope.people.length; i++) {
                    if($scope.people[i].user.id === userId) {
                        $scope.people.splice(i, 1);
                        break;
                    }
                }
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to remove user from org');
            });
        };

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
    }
]);


PeopleControllers.controller('PeopleAdd', ['$scope', '$location', 'Organization',
    function($scope, $location, Organization) {

        $scope.save = function(newUser) {
            $scope.$broadcast("form:reset");

            newUser.orgId = $scope.currentOrg.id;
            newUser.admin = false;
            Organization.member_create(newUser, function (result) {
                // just go back to people listing page for now
                $location.path('/'+$scope.currentOrg.slug+'/admin/people/');
            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };
    }
]);
