'use strict';
/*global _*/

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['ngRoute', 'corvusadmin.settings.services']);

SettingsAdminControllers.controller('SettingsAdminController', ['$scope', 'SettingsAdminServices',
    function($scope, SettingsAdminServices) {
        $scope.settingsList = [];
        $scope.newSetting = {
            name: null,
            value: null
        };

        SettingsAdminServices.list(function(results) {
            delete results.$resolved; // these keys come back as part of results
            delete results.$promise; // remove them since they are not actually part of the results we want to show

            $scope.settingsList = _.map(_.pairs(results), function(pair) {
                return {
                    name: pair[0],
                    value: pair[1],
                    originalValue: pair[1]
                };
            });
            console.log("SETTINGS:", $scope.settingsList);
        }, function(error) {
            console.log("Error fetching settings list: ", error);
        });

        $scope.deleteSetting = function(name) {
            SettingsAdminServices.delete({
                name: name
            }, function() {
                $scope.settingsList = _.filter($scope.settingsList, function(setting) {
                    return setting.name !== name;
                });
            }, function(error) {
                console.log("Error deleting setting: ", error);
            });
        };

        $scope.saveSetting = function(setting) {
            SettingsAdminServices.save(setting, function() {
                // update new value in settingsList
                $scope.settingsList = _.map($scope.settingsList, function(s) {
                    if (s.name == setting.name) {
                        s.value = setting.value;
                        s.originalValue = setting.value;
                    }
                    return s;
                });
            }, function(error) {
                console.log("Error saving setting: ", error);
            });
        };

        /// is settingName only lowercase letters or '-'?
        $scope.settingNameIsValid = function(settingName) {
            return !!(settingName.match(/^[a-z-]+$/));
        };

        $scope.saveNewSetting = function() {
            SettingsAdminServices.save($scope.newSetting, function() {
                $scope.newSetting.originalValue = $scope.newSetting.value;
                $scope.settingsList.push($scope.newSetting);
                $scope.newSetting = {
                    name: null,
                    value: null
                };
            }, function(error) {
                console.log("Error saving setting: ", error);
            })
        }
    }
]);