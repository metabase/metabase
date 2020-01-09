/* @flow weak */

import _ from "underscore";
import inflection from "inflection";
import { t } from "ttag";
import MetabaseUtils from "metabase/lib/utils";

// TODO: dump this from backend settings definitions
export type SettingName =
  | "admin-email"
  | "anon-tracking-enabled"
  | "available-locales"
  | "available-timezones"
  | "custom-formatting"
  | "custom-geojson"
  | "email-configured?"
  | "enable-embedding"
  | "enable-public-sharing"
  | "enable-xrays"
  | "engines"
  | "ga-code"
  | "google-auth-client-id"
  | "has-sample-dataset?"
  | "hide-embed-branding?"
  | "ldap-configured?"
  | "map-tile-server-url"
  | "password-complexity"
  | "setup-token"
  | "site-url"
  | "types"
  | "version";

type SettingsMap = { [key: SettingName]: any };

// provides access to Metabase application settings
class Settings {
  _settings: SettingsMap;
  _listeners: { [key: SettingName]: Function[] };

  constructor(settings: SettingsMap) {
    this._settings = settings;
    this._listeners = {};
  }

  get(key: SettingName, defaultValue: any = null) {
    return this._settings[key] !== undefined
      ? this._settings[key]
      : defaultValue;
  }

  set(key: SettingName, value: any) {
    if (this._settings[key] !== value) {
      this._settings[key] = value;
      if (this._listeners[key]) {
        for (const listener of this._listeners[key]) {
          setTimeout(() => listener(value));
        }
      }
    }
  }

  setAll(settings: SettingsMap) {
    for (const [key, value] of Object.entries(settings)) {
      // $FlowFixMe
      this.set(key, value);
    }
  }

  on(key, callback) {
    this._listeners[key] = this._listeners[key] || [];
    this._listeners[key].push(callback);
  }

  // these are all special accessors which provide a lookup of a property plus some additional help
  adminEmail() {
    return this.get("admin-email");
  }

  isEmailConfigured() {
    return this.get("email-configured?");
  }

  isTrackingEnabled() {
    return this.get("anon-tracking-enabled") || false;
  }

  hasSetupToken() {
    return this.get("setup-token") != null;
  }

  ssoEnabled() {
    return this.get("google-auth-client-id") != null;
  }

  ldapEnabled() {
    return this.get("ldap-configured?");
  }

  hideEmbedBranding() {
    return this.get("hide-embed-branding?");
  }

  docsUrl(page = "", anchor = "") {
    let { tag } = this.get("version", {});
    if (!tag) {
      tag = "latest";
    }
    if (page) {
      page = `/${page}.html`;
    }
    if (anchor) {
      anchor = `#${anchor}`;
    }
    return `https://metabase.com/docs/${tag}${page}${anchor}`;
  }

  newVersionAvailable(settings) {
    let versionInfo = _.findWhere(settings, { key: "version-info" });
    const currentVersion = this.get("version").tag;

    if (versionInfo) {
      versionInfo = versionInfo.value;
    }

    return (
      versionInfo &&
      versionInfo.latest &&
      MetabaseUtils.compareVersions(
        currentVersion,
        versionInfo.latest.version,
      ) < 0
    );
  }

  // returns a map that looks like {total: 6, digit: 1}
  passwordComplexityRequirements() {
    return this.get("password-complexity");
  }

  // returns a description of password complexity requirements rather than the actual map of requirements
  passwordComplexityDescription(capitalize) {
    const complexity = this.get("password-complexity");

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
  }
}

export default new Settings(_.clone(window.MetabaseBootstrap));
