import _ from "underscore";
import { createSelector } from "reselect";
import MetabaseSettings from "metabase/lib/settings";

import { slugify } from "metabase/lib/formatting";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget.jsx";
import {
    PublicLinksDashboardListing,
    PublicLinksQuestionListing,
    EmbeddedQuestionListing,
    EmbeddedDashboardListing
} from "./components/widgets/PublicLinksListing.jsx";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget.jsx";
import EmbeddingLegalese from "./components/widgets/EmbeddingLegalese";

import { UtilApi } from "metabase/services";

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
                key: "site-url",
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
                note: "Not all databases support timezones, in which case this setting won't take effect.",
                allowValueCollection: true
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
                type: "number",
                required: true,
                validations: [["integer", "That's not a valid port number"]]
            },
            {
                key: "email-smtp-security",
                display_name: "SMTP Security",
                description: null,
                type: "radio",
                options: { none: "None", ssl: "SSL", tls: "TLS", starttls: "STARTTLS" },
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
                display_name: "MetaBot",
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
        name: "Maps",
        settings: [
            {
                key: "map-tile-server-url",
                display_name: "Map tile server URL",
                note: "Metabase uses OpenStreetMaps by default.",
                type: "string"
            },
            {
                key: "custom-geojson",
                display_name: "Custom Maps",
                description: "Add your own GeoJSON files to enable different region map visualizations",
                widget: CustomGeoJSONWidget,
                noHeader: true
            }
        ]
    },
    {
        name: "Public Sharing",
        settings: [
            {
                key: "enable-public-sharing",
                display_name: "Enable Public Sharing",
                type: "boolean"
            },
            {
                key: "-public-sharing-dashboards",
                display_name: "Shared Dashboards",
                widget: PublicLinksDashboardListing,
                getHidden: (settings) => !settings["enable-public-sharing"]
            },
            {
                key: "-public-sharing-questions",
                display_name: "Shared Questions",
                widget: PublicLinksQuestionListing,
                getHidden: (settings) => !settings["enable-public-sharing"]
            }
        ]
    },
    {
        name: "Embedding in other Applications",
        settings: [
            {
                key: "enable-embedding",
                description: null,
                widget: EmbeddingLegalese,
                getHidden: (settings) => settings["enable-embedding"],
                onChanged: async (oldValue, newValue, settingsValues, onChange) => {
                    if (!oldValue && newValue && !settingsValues["embedding-secret-key"]) {
                        let result = await UtilApi.random_token();
                        await onChange("embedding-secret-key", result.token);
                    }
                }
            },
            {
                key: "enable-embedding",
                display_name: "Enable Embedding Metabase in other Applications",
                type: "boolean",
                getHidden: (settings) => !settings["enable-embedding"]
            },
            {
                key: "embedding-secret-key",
                display_name: "Embedding secret key",
                widget: SecretKeyWidget,
                getHidden: (settings) => !settings["enable-embedding"]
            },
            {
                key: "-embedded-dashboards",
                display_name: "Embedded Dashboards",
                widget: EmbeddedDashboardListing,
                getHidden: (settings) => !settings["enable-embedding"]
            },
            {
                key: "-embedded-questions",
                display_name: "Embedded Questions",
                widget: EmbeddedQuestionListing,
                getHidden: (settings) => !settings["enable-embedding"]
            }
        ]
    },
    {
        name: "Caching",
        settings: [
            {
                key: "enable-query-caching",
                display_name: "Enable Caching",
                type: "boolean"
            },
            {
                key: "query-caching-min-ttl",
                display_name: "Minimum Query Duration",
                type: "number",
                getHidden: (settings) => !settings["enable-query-caching"],
                allowValueCollection: true
            },
            {
                key: "query-caching-ttl-ratio",
                display_name: "Cache Time-To-Live (TTL) multiplier",
                type: "number",
                getHidden: (settings) => !settings["enable-query-caching"],
                allowValueCollection: true
            },
            {
                key: "query-caching-max-kb",
                display_name: "Max Cache Entry Size",
                type: "number",
                getHidden: (settings) => !settings["enable-query-caching"],
                allowValueCollection: true
            }
        ]
    }
];
for (const section of SECTIONS) {
    section.slug = slugify(section.name);
}

export const getSettings = createSelector(
    state => state.settings.settings,
    state => state.admin.settings.warnings,
    (settings, warnings) =>
        settings.map(setting => warnings[setting.key] ?
            { ...setting, warning: warnings[setting.key] } :
            setting
        )
)

export const getSettingValues = createSelector(
    getSettings,
    (settings) => {
        const settingValues = {};
        for (const setting of settings) {
            settingValues[setting.key] = setting.value;
        }
        return settingValues;
    }
)

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
                const apiSetting = settingsByKey[setting.key] && settingsByKey[setting.key][0];
                if (apiSetting) {
                    return {
                        placeholder: apiSetting.default,
                        ...apiSetting,
                        ...setting
                    };
                } else {
                    return setting;
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
