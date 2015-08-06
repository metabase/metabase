'use strict';
/*global _*/

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['corvusadmin.settings.services']);

SettingsAdminControllers.controller('SettingsAdminController', ['$scope', '$q', 'AppState', 'SettingsAdminServices',
    function($scope, $q, AppState, SettingsAdminServices) {
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
            return setting.description.replace(/\.$/, '');
        }

        $scope.settingPlaceholder = function(setting) {
            return setting.default;
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

                // refresh the app-wide settings now as the user may have just changed some of them
                AppState.refreshSiteSettings();

            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };
    }
]);
