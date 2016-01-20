import _ from "underscore";

import SettingsEditor from './components/SettingsEditor.jsx';
import MetabaseSettings from 'metabase/lib/settings';


var SettingsAdminControllers = angular.module('metabase.admin.settings.controllers', ['metabase.services']);

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
                options: [
                    { name: "Database Default", value: "" },
                    ...MetabaseSettings.get('timezones')
                ],
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
