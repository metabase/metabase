import _ from "underscore";
import { createSelector } from "reselect";
import MetabaseSettings from "metabase/lib/settings";
import { t } from "c-3po";
import CustomGeoJSONWidget from "./components/widgets/CustomGeoJSONWidget.jsx";
import {
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
  EmbeddedQuestionListing,
  EmbeddedDashboardListing,
} from "./components/widgets/PublicLinksListing.jsx";
import SecretKeyWidget from "./components/widgets/SecretKeyWidget.jsx";
import EmbeddingLegalese from "./components/widgets/EmbeddingLegalese";
import EmbeddingLevel from "./components/widgets/EmbeddingLevel";
import LdapGroupMappingsWidget from "./components/widgets/LdapGroupMappingsWidget";

import { UtilApi } from "metabase/services";

/* Note - do not translate slugs */
const SECTIONS = [
  {
    name: t`Setup`,
    slug: "setup",
    settings: [],
  },
  {
    name: t`General`,
    slug: "general",
    settings: [
      {
        key: "site-name",
        display_name: t`Site Name`,
        type: "string",
      },
      {
        key: "site-url",
        display_name: t`Site URL`,
        type: "string",
      },
      {
        key: "admin-email",
        display_name: t`Email Address for Help Requests`,
        type: "string",
      },
      {
        key: "report-timezone",
        display_name: t`Report Timezone`,
        type: "select",
        options: [
          { name: t`Database Default`, value: "" },
          ...MetabaseSettings.get("timezones"),
        ],
        placeholder: t`Select a timezone`,
        note: t`Not all databases support timezones, in which case this setting won't take effect.`,
        allowValueCollection: true,
      },
      {
        key: "site-locale",
        display_name: t`Language`,
        type: "select",
        options: (MetabaseSettings.get("available_locales") || []).map(
          ([value, name]) => ({ name, value }),
        ),
        placeholder: t`Select a language`,
        getHidden: () => MetabaseSettings.get("available_locales").length < 2,
      },
      {
        key: "anon-tracking-enabled",
        display_name: t`Anonymous Tracking`,
        type: "boolean",
      },
      {
        key: "humanization-strategy",
        display_name: t`Friendly Table and Field Names`,
        type: "select",
        options: [
          { value: "advanced", name: t`Enabled` },
          {
            value: "simple",
            name: t`Only replace underscores and dashes with spaces`,
          },
          { value: "none", name: t`Disabled` },
        ],
        // this needs to be here because 'advanced' is the default value, so if you select 'advanced' the
        // widget will always show the placeholder instead of the 'name' defined above :(
        placeholder: t`Enabled`,
      },
      {
        key: "enable-nested-queries",
        display_name: t`Enable Nested Queries`,
        type: "boolean",
      },
    ],
  },
  {
    name: t`Updates`,
    slug: "updates",
    settings: [
      {
        key: "check-for-updates",
        display_name: t`Check for updates`,
        type: "boolean",
      },
    ],
  },
  {
    name: t`Email`,
    slug: "email",
    settings: [
      {
        key: "email-smtp-host",
        display_name: t`SMTP Host`,
        placeholder: "smtp.yourservice.com",
        type: "string",
        required: true,
        autoFocus: true,
      },
      {
        key: "email-smtp-port",
        display_name: t`SMTP Port`,
        placeholder: "587",
        type: "number",
        required: true,
        validations: [["integer", t`That's not a valid port number`]],
      },
      {
        key: "email-smtp-security",
        display_name: t`SMTP Security`,
        description: null,
        type: "radio",
        options: { none: "None", ssl: "SSL", tls: "TLS", starttls: "STARTTLS" },
        defaultValue: "none",
      },
      {
        key: "email-smtp-username",
        display_name: t`SMTP Username`,
        description: null,
        placeholder: "youlooknicetoday",
        type: "string",
      },
      {
        key: "email-smtp-password",
        display_name: t`SMTP Password`,
        description: null,
        placeholder: "Shh...",
        type: "password",
      },
      {
        key: "email-from-address",
        display_name: t`From Address`,
        placeholder: "metabase@yourcompany.com",
        type: "string",
        required: true,
        validations: [["email", t`That's not a valid email address`]],
      },
    ],
  },
  {
    name: "Slack",
    slug: "slack",
    settings: [
      {
        key: "slack-token",
        display_name: t`Slack API Token`,
        description: "",
        placeholder: t`Enter the token you received from Slack`,
        type: "string",
        required: false,
        autoFocus: true,
      },
      {
        key: "metabot-enabled",
        display_name: "MetaBot",
        type: "boolean",
        // TODO: why do we have "defaultValue" here in addition to the "default" specified by the backend?
        defaultValue: false,
        required: true,
        autoFocus: false,
      },
    ],
  },
  {
    name: t`Single Sign-On`,
    slug: "single_sign_on",
    sidebar: false,
    settings: [
      {
        key: "google-auth-client-id",
      },
      {
        key: "google-auth-auto-create-accounts-domain",
      },
    ],
  },
  {
    name: t`Authentication`,
    slug: "authentication",
    settings: [],
  },
  {
    name: t`LDAP`,
    slug: "ldap",
    sidebar: false,
    settings: [
      {
        key: "ldap-enabled",
        display_name: t`LDAP Authentication`,
        description: null,
        type: "boolean",
      },
      {
        key: "ldap-host",
        display_name: t`LDAP Host`,
        placeholder: "ldap.yourdomain.org",
        type: "string",
        required: true,
        autoFocus: true,
      },
      {
        key: "ldap-port",
        display_name: t`LDAP Port`,
        placeholder: "389",
        type: "string",
        validations: [["integer", t`That's not a valid port number`]],
      },
      {
        key: "ldap-security",
        display_name: t`LDAP Security`,
        description: null,
        type: "radio",
        options: { none: "None", ssl: "SSL", starttls: "StartTLS" },
        defaultValue: "none",
      },
      {
        key: "ldap-bind-dn",
        display_name: t`Username or DN`,
        type: "string",
      },
      {
        key: "ldap-password",
        display_name: t`Password`,
        type: "password",
      },
      {
        key: "ldap-user-base",
        display_name: t`User search base`,
        type: "string",
        required: true,
      },
      {
        key: "ldap-user-filter",
        display_name: t`User filter`,
        type: "string",
        validations: [
          [
            value =>
              (value.match(/\(/g) || []).length !==
              (value.match(/\)/g) || []).length
                ? t`Check your parentheses`
                : null,
          ],
        ],
      },
      {
        key: "ldap-attribute-email",
        display_name: t`Email attribute`,
        type: "string",
      },
      {
        key: "ldap-attribute-firstname",
        display_name: t`First name attribute`,
        type: "string",
      },
      {
        key: "ldap-attribute-lastname",
        display_name: t`Last name attribute`,
        type: "string",
      },
      {
        key: "ldap-group-sync",
        display_name: t`Synchronize group memberships`,
        description: null,
        widget: LdapGroupMappingsWidget,
      },
      {
        key: "ldap-group-base",
        display_name: t`Group search base`,
        type: "string",
      },
      {
        key: "ldap-group-mappings",
      },
    ],
  },
  {
    name: t`Maps`,
    slug: "maps",
    settings: [
      {
        key: "map-tile-server-url",
        display_name: t`Map tile server URL`,
        note: t`Metabase uses OpenStreetMaps by default.`,
        type: "string",
      },
      {
        key: "custom-geojson",
        display_name: t`Custom Maps`,
        description: t`Add your own GeoJSON files to enable different region map visualizations`,
        widget: CustomGeoJSONWidget,
        noHeader: true,
      },
    ],
  },
  {
    name: t`Public Sharing`,
    slug: "public_sharing",
    settings: [
      {
        key: "enable-public-sharing",
        display_name: t`Enable Public Sharing`,
        type: "boolean",
      },
      {
        key: "-public-sharing-dashboards",
        display_name: t`Shared Dashboards`,
        widget: PublicLinksDashboardListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
      {
        key: "-public-sharing-questions",
        display_name: t`Shared Questions`,
        widget: PublicLinksQuestionListing,
        getHidden: settings => !settings["enable-public-sharing"],
      },
    ],
  },
  {
    name: t`Embedding in other Applications`,
    slug: "embedding_in_other_applications",
    settings: [
      {
        key: "enable-embedding",
        description: null,
        widget: EmbeddingLegalese,
        getHidden: settings => settings["enable-embedding"],
        onChanged: async (
          oldValue,
          newValue,
          settingsValues,
          onChangeSetting,
        ) => {
          // Generate a secret key if none already exists
          if (
            !oldValue &&
            newValue &&
            !settingsValues["embedding-secret-key"]
          ) {
            let result = await UtilApi.random_token();
            await onChangeSetting("embedding-secret-key", result.token);
          }
        },
      },
      {
        key: "enable-embedding",
        display_name: t`Enable Embedding Metabase in other Applications`,
        type: "boolean",
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        widget: EmbeddingLevel,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "embedding-secret-key",
        display_name: t`Embedding secret key`,
        widget: SecretKeyWidget,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "-embedded-dashboards",
        display_name: t`Embedded Dashboards`,
        widget: EmbeddedDashboardListing,
        getHidden: settings => !settings["enable-embedding"],
      },
      {
        key: "-embedded-questions",
        display_name: t`Embedded Questions`,
        widget: EmbeddedQuestionListing,
        getHidden: settings => !settings["enable-embedding"],
      },
    ],
  },
  {
    name: t`Caching`,
    slug: "caching",
    settings: [
      {
        key: "enable-query-caching",
        display_name: t`Enable Caching`,
        type: "boolean",
      },
      {
        key: "query-caching-min-ttl",
        display_name: t`Minimum Query Duration`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
      {
        key: "query-caching-ttl-ratio",
        display_name: t`Cache Time-To-Live (TTL) multiplier`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
      {
        key: "query-caching-max-kb",
        display_name: t`Max Cache Entry Size`,
        type: "number",
        getHidden: settings => !settings["enable-query-caching"],
        allowValueCollection: true,
      },
    ],
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

export const getSettings = createSelector(
  state => state.settings.settings,
  state => state.admin.settings.warnings,
  (settings, warnings) =>
    settings.map(
      setting =>
        warnings[setting.key]
          ? { ...setting, warning: warnings[setting.key] }
          : setting,
    ),
);

export const getSettingValues = createSelector(getSettings, settings => {
  const settingValues = {};
  for (const setting of settings) {
    settingValues[setting.key] = setting.value;
  }
  return settingValues;
});

export const getNewVersionAvailable = createSelector(getSettings, settings => {
  return MetabaseSettings.newVersionAvailable(settings);
});

export const getSections = createSelector(getSettings, settings => {
  if (!settings || _.isEmpty(settings)) {
    return [];
  }

  let settingsByKey = _.groupBy(settings, "key");
  return SECTIONS.map(function(section) {
    let sectionSettings = section.settings.map(function(setting) {
      const apiSetting =
        settingsByKey[setting.key] && settingsByKey[setting.key][0];
      if (apiSetting) {
        return {
          placeholder: apiSetting.default,
          ...apiSetting,
          ...setting,
        };
      } else {
        return setting;
      }
    });
    return {
      ...section,
      settings: sectionSettings,
    };
  });
});

export const getActiveSectionName = (state, props) => props.params.section;

export const getActiveSection = createSelector(
  getActiveSectionName,
  getSections,
  (section = "setup", sections) => {
    if (sections) {
      return _.findWhere(sections, { slug: section });
    } else {
      return null;
    }
  },
);
