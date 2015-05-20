'use strict';
/*global _*/

var PeopleControllers = angular.module('corvusadmin.people.controllers', [
    'corvus.services',
    'metabase.forms'
]);

PeopleControllers.controller('PeopleList', ['$scope', 'User',
    function($scope, User) {

        // grant superuser permission for a given user
        var grant = function(user) {
            user.is_superuser = true;

            User.update(user, function (result) {
                $scope.people.forEach(function (u) {
                    if (u.id === user.id) {
                        u.is_superuser = true;
                    }
                });
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to grant superuser to user');
            });
        };

        // revoke superuser permission for a given user
        var revoke = function(user) {
            user.is_superuser = false;

            User.update(user, function (result) {
                $scope.people.forEach(function (u) {
                    if (u.id === user.id) {
                        u.is_superuser = false;
                    }
                });
            }, function (error) {
                console.log('error', error);
                $scope.alertError('failed to revoke superuser from user');
            });
        };

        // toggle superuser permission for a given user
        $scope.toggle = function(userId) {
            $scope.people.forEach(function (user) {
                if (user.id === userId) {
                    if (user.is_superuser) {
                        revoke(user);
                    } else {
                        grant(user);
                    }
                }
            });
        };

        // completely remove a given user
        // TODO: we need this api function now
        $scope.delete = function(userId) {
            User.delete({
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
                $scope.alertError('failed to remove user');
            });
        };

        User.list(function (result) {
            $scope.people = result;
        }, function (error) {
            console.log('error', error);
        });
    }
]);


PeopleControllers.controller('PeopleAdd', ['$scope', '$location', 'User',
    function($scope, $location, User) {

        $scope.save = function(newUser) {
            $scope.$broadcast("form:reset");

            newUser.is_superuser = false;

            // TODO: we need this function!!
            User.create(newUser, function (result) {
                // just go back to people listing page for now
                $location.path('/admin/people/');
            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };
    }
]);
