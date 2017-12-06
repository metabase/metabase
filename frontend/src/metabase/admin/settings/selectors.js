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
import EmbeddingLevel from "./components/widgets/EmbeddingLevel";
import LdapGroupMappingsWidget from "./components/widgets/LdapGroupMappingsWidget";

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
                key: "site-locale",
                display_name: "Language",
                type: "select",
                options:  (MetabaseSettings.get("available_locales") || []).map(([value, name]) => ({ name, value })),
                placeholder: "Select a language",
                getHidden: () => MetabaseSettings.get("available_locales").length < 2
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
                key: "enable-nested-queries",
                display_name: "Enable Nested Queries",
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
        sidebar: false,
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
        name: "Authentication",
        settings: []
    },
    {
        name: "LDAP",
        sidebar: false,
        settings: [
            {
                key: "ldap-enabled",
                display_name: "LDAP Authentication",
                description: null,
                type: "boolean"
            },
            {
                key: "ldap-host",
                display_name: "LDAP Host",
                placeholder: "ldap.yourdomain.org",
                type: "string",
                required: true,
                autoFocus: true
            },
            {
                key: "ldap-port",
                display_name: "LDAP Port",
                placeholder: "389",
                type: "string",
                validations: [["integer", "That's not a valid port number"]]
            },
            {
                key: "ldap-security",
                display_name: "LDAP Security",
                description: null,
                type: "radio",
                options: { none: "None", ssl: "SSL", starttls: "StartTLS" },
                defaultValue: "none"
            },
            {
                key: "ldap-bind-dn",
                display_name: "Username or DN",
                type: "string"
            },
            {
                key: "ldap-password",
                display_name: "Password",
                type: "password"
            },
            {
                key: "ldap-user-base",
                display_name: "User search base",
                type: "string",
                required: true
            },
            {
                key: "ldap-user-filter",
                display_name: "User filter",
                type: "string",
                validations: [["ldap_filter", "Check your parentheses"]]
            },
            {
                key: "ldap-attribute-email",
                display_name: "Email attribute",
                type: "string"
            },
            {
                key: "ldap-attribute-firstname",
                display_name: "First name attribute",
                type: "string"
            },
            {
                key: "ldap-attribute-lastname",
                display_name: "Last name attribute",
                type: "string"
            },
            {
                key: "ldap-group-sync",
                display_name: "Synchronize group memberships",
                description: null,
                widget: LdapGroupMappingsWidget
            },
            {
                key: "ldap-group-base",
                display_name: "Group search base",
                type: "string"
            },
            {
                key: "ldap-group-mappings"
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
                description: t`Add your own GeoJSON files to enable different region map visualizations`,
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
                onChanged: async (oldValue, newValue, settingsValues, onChangeSetting) => {
                    // Generate a secret key if none already exists
                    if (!oldValue && newValue && !settingsValues["embedding-secret-key"]) {
                        let result = await UtilApi.random_token();
                        await onChangeSetting("embedding-secret-key", result.token);
                    }
                }
            }, {
                key: "enable-embedding",
                display_name: "Enable Embedding Metabase in other Applications",
                type: "boolean",
                getHidden: (settings) => !settings["enable-embedding"]
            },
            {
                widget: EmbeddingLevel,
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
    },
    {
        name: "X-Rays",
        settings: [
            {
                key: "enable-xrays",
                display_name: "Enable X-Rays",
                type: "boolean",
                allowValueCollection: true
            },
            {
                key: "xray-max-cost",
                type: "string",
                allowValueCollection: true

            }
        ]
    },
    /*
    {
        name: "Premium Embedding",
        settings: [
            {
                key: "premium-embedding-token",
                display_name: "Premium Embedding Token",
                widget: PremiumEmbeddingWidget
            }
        ]
    }
    */
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
