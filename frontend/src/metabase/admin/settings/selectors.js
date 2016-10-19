import _ from "underscore";
import { createSelector } from "reselect";
import MetabaseSettings from "metabase/lib/settings";

import { slugify } from "metabase/lib/formatting";

const SECTIONS = [
    {
        name: "Setup",
        settings: []
    },
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
                placeholder: "Select a timezone",
                note: "Not all databases support timezones, in which case this setting won't take effect."
            },
            {
                key: "anon-tracking-enabled",
                display_name: "Anonymous Tracking",
                type: "boolean"
            },
            {
                key: "enable-advanced-humanization",
                display_name: "Friendly Table and Field Names",
                type: "boolean"
            },
            {
                key: "google-maps-api-key",
                display_name: "Google Maps API Key",
                type: "string"
            }
        ]
    },
    {
        name: "Updates",
        settings: [
            {
                key: "check-for-updates",
                display_name: "Check for updates",
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
                placeholder: "Enter the token you received from Slack",
                type: "string",
                required: false,
                autoFocus: true
            },
            {
                key: "metabot-enabled",
                display_name: "Metabot",
                type: "boolean",
                // TODO: why do we have "defaultValue" in addition to "default" in the backend?
                defaultValue: false,
                required: true,
                autoFocus: false
            },
        ]
    },
    {
        name: "Single Sign-On",
        settings: [
            {
                key: "google-auth-client-id"
            },
            {
                key: "google-auth-auto-create-accounts-domain"
            }
        ]
    },
    {
        name: "Custom Maps",
        settings: [
            {
                key: "custom-geojson"
            }
        ]
    }
];
for (const section of SECTIONS) {
    section.slug = slugify(section.name);
}

export const getSettings = state => state.settings.settings;

export const getNewVersionAvailable = createSelector(
    getSettings,
    (settings) => {
        return MetabaseSettings.newVersionAvailable(settings);
    }
);

export const getSections = createSelector(
    getSettings,
    (settings) => {
        if (!settings || _.isEmpty(settings)) {
            return [];
        }

        let settingsByKey = _.groupBy(settings, 'key');
        return SECTIONS.map(function(section) {
            let sectionSettings = section.settings.map(function(setting) {
                const apiSetting = settingsByKey[setting.key][0];
                if (apiSetting) {
                    return {
                        placeholder: apiSetting.default,
                        ...apiSetting,
                        ...setting
                    };
                }
            });
            return {
                ...section,
                settings: sectionSettings
            };
        });
    }
);

export const getActiveSectionName = (state, props) => props.params.section

export const getActiveSection = createSelector(
    getActiveSectionName,
    getSections,
    (section = "setup", sections) => {
        if (sections) {
            return _.findWhere(sections, { slug: section });
        } else {
            return null;
        }
    }
);
