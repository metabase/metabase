'use strict';
/*global _*/

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['corvusadmin.settings.services']);

SettingsAdminControllers.controller('SettingsAdminController', ['$scope', '$q', 'SettingsAdminServices',
    function($scope, $q, SettingsAdminServices) {
        $scope.settings = [];

        SettingsAdminServices.list(function(results) {
            $scope.settings = _.map(results, function(result) {
                result.originalValue = result.value;
                return result;
            });
        }, function(error) {
            console.log("Error fetching settings list: ", error);
        });

        $scope.settingName = function(setting) {
            // return setting.description.replace(/\.$/, '');
            return setting.key
                .replace(/-/g, ' ')
                .replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); })
                .replace(/smtp/i, function(a) { return a.toUpperCase(); });
        }

        $scope.settingPlaceholder = function(setting) {
            // return setting.default;
            return setting.description.replace(/\.$/, '');
        }

        $scope.save = function() {
            $scope.$broadcast("form:reset");
            return $q.all($scope.settings.map(function(setting) {
                if (setting.value !== setting.originalValue) {
                    return SettingsAdminServices.put({
                        key: setting.key
                    }, setting).$promise.then(function() {
                        setting.originalValue = setting.value;
                    });
                }
            })).then(function(results) {
                $scope.$broadcast("form:api-success", "Successfully saved!");
            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };
    }
]);
