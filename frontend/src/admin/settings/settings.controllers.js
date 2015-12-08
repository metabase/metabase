import _ from "underscore";

import SettingsEditor from './components/SettingsEditor.jsx';


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
                options: { none: "None", ssl: "SSL", tls: "TLS" },
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
    },
    {
        name: "Slack",
        settings: [
            {
                key: "slack-token",
                display_name: "Slack API Token",
                description: "",
                placeholder: "Enter the token you recieved from Slack",
                type: "string",
                required: true,
                autoFocus: true
            }
        ]
    },
    {
        name: "Plugins",
        settings: [
            {
                key: "oracle-jdbc-driver-path",
                display_name: "Oracle JDBC Driver Path",
                description: "Path to Oracle JDBC driver JAR. Download it at http://www.oracle.com/technetwork/database/features/jdbc/default-2280470.html.",
                placeholder: "/Users/camsaul/Downloads/ojdbc7.jar",
                type: "string"
            }
        ]
    }
];

SettingsAdminControllers.controller('SettingsEditor', ['$scope', '$location', 'Settings', 'Email', 'Slack', 'AppState', 'settings',
    function($scope, $location, Settings, Email, Slack, AppState, settings) {
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

        $scope.updateEmailSettings = async function(settings) {
            await Email.updateSettings(settings).$promise;
            AppState.refreshSiteSettings();
        }

        $scope.updateSlackSettings = async function(settings) {
            await Slack.updateSettings(settings).$promise;
            AppState.refreshSiteSettings();
        }

        $scope.sendTestEmail = async function(settings) {
            await Email.sendTest().$promise;
        }

        let settingsByKey = _.groupBy(settings, 'key');
        $scope.sections = SECTIONS.map(function(section) {
            let sectionSettings = section.settings.map(function(setting) {
                const apiSetting = settingsByKey[setting.key][0];
                if (apiSetting) {
                    apiSetting.placeholder = apiSetting.default;
                    return _.extend(apiSetting, setting);
                }
            });

            let updatedSection = _.clone(section);
            updatedSection.settings = sectionSettings;
            return updatedSection;
        });
    }
]);
