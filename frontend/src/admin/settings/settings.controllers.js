import _ from "underscore";

import SettingsEditor from './components/SettingsEditor.jsx';

import Humanize from "humanize";

var SettingsAdminControllers = angular.module('metabaseadmin.settings.controllers', ['metabase.services']);

// from common.clj
var TIMEZONES = [
    { name: "Database Default", value: "" },
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

const SECTIONS = [
    {
        name: "General",
        settings: [
            {
                key: "site-name",
                display_name: "Site Name",
                type: "string"
            },
            {
                key: "-site-url",
                display_name: "Site URL",
                type: "string"
            },
            {
                key: "admin-email",
                display_name: "Email Address for Help Requests",
                type: "string"
            },
            {
                key: "report-timezone",
                display_name: "Report Timezone",
                type: "select",
                options: TIMEZONES,
                placeholder: "Select a timezone"
            },
            {
                key: "anon-tracking-enabled",
                display_name: "Anonymous Tracking",
                type: "boolean"
            }
        ]
    },
    {
        name: "Email",
        settings: [
            {
                key: "email-smtp-host",
                display_name: "SMTP Host",
                placeholder: "smtp.yourservice.com",
                type: "string",
                required: true,
                autoFocus: true
            },
            {
                key: "email-smtp-port",
                display_name: "SMTP Port",
                placeholder: "587",
                type: "string",
                required: true,
                validations: [["integer", "That's not a valid port number"]]
            },
            {
                key: "email-smtp-security",
                display_name: "SMTP Security",
                description: null,
                type: "radio",
                options: { none: "None", tls: "TLS", ssl: "SSL" },
                defaultValue: 'none'
            },
            {
                key: "email-smtp-username",
                display_name: "SMTP Username",
                description: null,
                placeholder: "youlooknicetoday",
                type: "string"
            },
            {
                key: "email-smtp-password",
                display_name: "SMTP Password",
                description: null,
                placeholder: "Shh...",
                type: "password"
            },
            {
                key: "email-from-address",
                display_name: "From Address",
                placeholder: "metabase@yourcompany.com",
                type: "string",
                required: true,
                validations: [["email", "That's not a valid email address"]]
            }
        ]
    }
];

SettingsAdminControllers.controller('SettingsEditor', ['$scope', '$location', 'Settings', 'AppState', 'settings',
    function($scope, $location, Settings, AppState, settings) {
        $scope.SettingsEditor = SettingsEditor;

        if ('section' in $location.search()) {
            $scope.initialSection = _.findIndex(SECTIONS, function(v) {
                return v.name === $location.search().section;
            });
        }

        $scope.updateSetting = async function(setting) {
            await Settings.put({ key: setting.key }, setting).$promise;
            AppState.refreshSiteSettings();
        };

        $scope.updateSettings = async function(settings) {
            await Settings.setAll(settings).$promise;
            AppState.refreshSiteSettings();
        }

        let settingsByKey = _.groupBy(settings, 'key');
        $scope.sections = SECTIONS.map(function(section) {
            let sectionSettings = section.settings.map(function(setting) {
                const apiSetting = settingsByKey[setting.key][0];
                if (apiSetting) {
                    apiSetting.display_name = keyToDisplayName(apiSetting.key);
                    apiSetting.placeholder = apiSetting.default;
                    return _.extend(apiSetting, setting);
                }
            });

            let updatedSection = _.clone(section);
            updatedSection.settings = sectionSettings;
            return updatedSection;
        });

        function keyToDisplayName(key) {
            return Humanize.capitalizeAll(key.replace(/-/g, " ")).trim();
        }
    }
]);
