import _ from "underscore";
import inflection from "inflection";
import { t } from "ttag";
import MetabaseUtils from "metabase/lib/utils";

const mb_settings = _.clone(window.MetabaseBootstrap);

const settingListeners = {};

// provides access to Metabase application settings
const MetabaseSettings = {
  get: function(propName, defaultValue = null) {
    return mb_settings[propName] !== undefined
      ? mb_settings[propName]
      : defaultValue;
  },

  set: function(key, value) {
    if (mb_settings[key] !== value) {
      mb_settings[key] = value;
      if (settingListeners[key]) {
        for (const listener of settingListeners[key]) {
          setTimeout(() => listener(value));
        }
      }
    }
  },

  setAll: function(settings) {
    for (const key in settings) {
      MetabaseSettings.set(key, settings[key]);
    }
  },

  // these are all special accessors which provide a lookup of a property plus some additional help
  adminEmail: function() {
    return mb_settings.admin_email;
  },

  isEmailConfigured: function() {
    return mb_settings.email_configured;
  },

  isTrackingEnabled: function() {
    return mb_settings.anon_tracking_enabled || false;
  },

  hasSetupToken: function() {
    return (
      mb_settings.setup_token !== undefined && mb_settings.setup_token !== null
    );
  },

  googleAuthEnabled: function() {
    return mb_settings.google_auth_client_id != null;
  },

  ldapEnabled: function() {
    return mb_settings.ldap_configured;
  },

  hideEmbedBranding: () => mb_settings.hide_embed_branding,

  metastoreUrl: () => mb_settings.metastore_url,

  docsTag() {
    return this.currentVersion() || "latest";
  },

  docsUrl: (page = "", anchor = "") => {
    const tag = MetabaseSettings.docsTag();
    if (page) {
      page = `/${page}.html`;
    }
    if (anchor) {
      anchor = `#${anchor}`;
    }
    return `https://metabase.com/docs/${tag}${page}${anchor}`;
  },

  newVersionAvailable() {
    const result = MetabaseUtils.compareVersions(
      this.currentVersion(),
      this.latestVersion(),
    );
    return result != null && result < 0;
  },

  versionIsLatest() {
    const result = MetabaseUtils.compareVersions(
      this.currentVersion(),
      this.latestVersion(),
    );
    return result != null && result >= 0;
  },

  /*
    We expect the versionInfo to take on the JSON structure detailed below.
    The 'older' section should contain only the last 5 previous versions, we don't need to go on forever.
    The highlights for a version should just be text and should be limited to 5 items tops.

    type VersionInfo = {
      latest: Version,
      older: Version[]
    };
    type Version = {
      version: string, // e.x. "v0.17.1"
      released: ISO8601Time,
      patch: bool,
      highlights: string[]
    };
  */
  versionInfo() {
    return this.get("version-info", {});
  },

  currentVersion() {
    return this.get("version", {}).tag;
  },

  latestVersion() {
    const { latest } = this.versionInfo();
    return latest && latest.version;
  },

  // returns a map that looks like {total: 6, digit: 1}
  passwordComplexityRequirements: () => mb_settings.password_complexity,

  // returns a description of password complexity requirements rather than the actual map of requirements
  passwordComplexityDescription: function(capitalize) {
    const complexity = this.get("password_complexity");

    const clauseDescription = function(clause) {
      switch (clause) {
        case "lower":
          return t`lower case letter`;
        case "upper":
          return t`upper case letter`;
        case "digit":
          return t`number`;
        case "special":
          return t`special character`;
      }
    };

    const description =
      capitalize === false
        ? t`must be at least ${complexity.total} characters long`
        : t`Must be at least ${complexity.total} characters long`;
    const clauses = [];

    ["lower", "upper", "digit", "special"].forEach(function(clause) {
      if (clause in complexity) {
        const desc =
          complexity[clause] > 1
            ? inflection.pluralize(clauseDescription(clause))
            : clauseDescription(clause);
        clauses.push(
          MetabaseUtils.numberToWord(complexity[clause]) + " " + desc,
        );
      }
    });

    if (clauses.length > 0) {
      return description + " " + t`and include` + " " + clauses.join(", ");
    } else {
      return description;
    }
  },

  on: function(setting, callback) {
    settingListeners[setting] = settingListeners[setting] || [];
    settingListeners[setting].push(callback);
  },
};

export default MetabaseSettings;
