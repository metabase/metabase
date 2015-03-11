'use strict';
/*global _*/

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['ngRoute', 'corvusadmin.settings.services']);

SettingsAdminControllers.controller('SettingsAdminController', ['$scope', 'SettingsAdminServices',
    function($scope, SettingsAdminServices) {
        $scope.settings = [];

        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            SettingsAdminServices.list({
                org: org.id
            }, function(results) {
                $scope.settings = _.map(results, function(result) {
                    result.originalValue = result.value;
                    return result;
                });
            }, function(error) {
                console.log("Error fetching settings list: ", error);
            });
        });

        $scope.saveSetting = function(setting) {
            setting.org = $scope.currentOrg.id;
            SettingsAdminServices.save(setting, function() {
                setting.originalValue = setting.value;
            }, function(error) {
                console.log("Error saving setting: ", error);
            });
        };

        $scope.deleteSetting = function(setting) {
            SettingsAdminServices.delete({
                key: setting.key,
                org: $scope.currentOrg.id
            }, function() {
                setting.value = null;
                setting.originalValue = null;
            }, function(error) {
                console.log("Error deleting setting: ", error);
            });
        };
    }
]);