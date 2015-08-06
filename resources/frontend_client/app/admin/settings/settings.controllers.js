'use strict';
/*global _*/

import SettingsEditor from './components/SettingsEditor.react';

import Humanize from "humanize";

var SettingsAdminControllers = angular.module('corvusadmin.settings.controllers', ['corvusadmin.settings.services']);

// from common.clj
var TIMEZONES = [
    "GMT",
    "UTC",
    "US/Alaska",
    "US/Arizona",
    "US/Central",
    "US/Eastern",
    "US/Hawaii",
    "US/Mountain",
    "US/Pacific",
    "America/Costa_Rica",
];

// temporary hardcoded metadata
var EXTRA_SETTINGS_METADATA = {
    "site-name":           { display_name: "Site Name",       section: "General", type: "string" },
    "-site-url":           { display_name: "Site URL",        section: "General", type: "string" },
    "report-timezone":     { display_name: "Report Timezone", section: "General", type: "select", options: TIMEZONES, placeholder: "Select a timezone" },
    "email-from-address":  { display_name: "From Address",    section: "Email",   type: "string" },
    "email-smtp-host":     { display_name: "SMTP Host",       section: "Email",   type: "string" },
    "email-smtp-port":     { display_name: "SMTP Port",       section: "Email",   type: "string" },
    "email-smtp-security": { display_name: "SMTP Security",   section: "Email",   type: "radio", options: { none: "None", tls: "TLS", ssl: "SSL" } },
    "email-smtp-username": { display_name: "SMTP Username",   section: "Email",   type: "string" },
    "email-smtp-password": { display_name: "SMTP Password",   section: "Email",   type: "password" },
};

SettingsAdminControllers.controller('SettingsEditor', ['$scope', 'SettingsAdminServices', 'settings', function($scope, SettingsAdminServices, settings) {
    $scope.SettingsEditor = SettingsEditor;

    $scope.updateSetting = async function(setting) {
        await SettingsAdminServices.put({ key: setting.key }, setting).$promise;
    }

    $scope.sections = {};
    settings.forEach(function(setting) {
        var defaults = { display_name: keyToDisplayName(setting.key), placeholder: setting.default };
        setting = _.extend(defaults, EXTRA_SETTINGS_METADATA[setting.key], setting);
        var sectionName = setting.section || "Other";
        $scope.sections[sectionName] = $scope.sections[sectionName] || [];
        $scope.sections[sectionName].push(setting);
    });

    function keyToDisplayName(key) {
        return Humanize.capitalizeAll(key.replace(/-/g, " ")).trim();
    }
}]);

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
            }, function(error) {
                $scope.$broadcast("form:api-error", error);
                throw error;
            });
        };
    }
]);
