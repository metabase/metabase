'use strict';
/*global _*/

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['ngRoute', 'corvusadmin.settings.services']);

SettingsAdminControllers.controller('SettingsAdminController', ['$scope', 'SettingsAdminServices',
    function($scope, SettingsAdminServices) {
        $scope.settings = [];

        SettingsAdminServices.list(function(results) {
            $scope.settings = _.map(results, function(result) {
                result.originalValue = result.value;
                return result;
            });
        }, function(error) {
            console.log("Error fetching settings list: ", error);
        });

        $scope.saveSetting = function(setting) {
            SettingsAdminServices.put({
                key: setting.key
            }, setting, function() {
                setting.originalValue = setting.value;
            }, function(error) {
                console.log("Error saving setting: ", error);
            });
        };

        $scope.deleteSetting = function(setting) {
            SettingsAdminServices.delete({
                key: setting.key
            }, function() {
                setting.value = null;
                setting.originalValue = null;
            }, function(error) {
                console.log("Error deleting setting: ", error);
            });
        };
    }
]);