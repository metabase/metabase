"use strict";
/*global _*/

var IndexControllers = angular.module('superadmin.index.controllers', []);

IndexControllers.controller('SuperAdminIndex', ['$scope',
    function($scope) {
        $scope.$watch('user', function(user) {
            if (user) {
                // TODO: get global site settings
            }
        });
    }
]);
