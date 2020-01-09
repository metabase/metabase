/* @flow weak */

import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
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
    return this.get("password-complexity", {});
  }

  /**
   * Returns a description of password complexity requirements.
   * Optionally takes a password and returns a description only including the requirements not met.
   */
  passwordComplexityDescription(password = "") {
    const requirements = this.passwordComplexityRequirements();

    const descriptions = {};
    for (const [name, clause] of Object.entries(PASSWORD_COMPLEXITY_CLAUSES)) {
      if (!clause.test(requirements, password)) {
        descriptions[name] = clause.description(requirements);
      }
    }

    const { total, ...rest } = descriptions;
    const includes = Object.values(rest).join(t`, `);
    if (total && includes) {
      return t`must be ${total} and include ${includes}.`;
    } else if (total) {
      return t`must be ${total}.`;
    } else if (includes) {
      return t`must include ${includes}.`;
    } else {
      return null;
    }
  }
}

const n2w = n => MetabaseUtils.numberToWord(n);

const PASSWORD_COMPLEXITY_CLAUSES = {
  total: {
    test: ({ total = 0 }, password = "") => password.length >= total,
    description: ({ total = 0 }) =>
      ngettext(
        msgid`at least ${n2w(total)} character long`,
        `at least ${n2w(total)} characters long`,
        total,
      ),
  },
  lower: {
    test: makeRegexTest("lower", /[a-z]/g),
    description: ({ lower = 0 }) =>
      ngettext(
        msgid`${n2w(lower)} lower case letter`,
        `${n2w(lower)} lower case letters`,
        lower,
      ),
  },
  upper: {
    test: makeRegexTest("upper", /[A-Z]/g),
    description: ({ upper = 0 }) =>
      ngettext(
        msgid`${n2w(upper)} upper case letter`,
        `${n2w(upper)} upper case letters`,
        upper,
      ),
  },
  digit: {
    test: makeRegexTest("digit", /[0-9]/g),
    description: ({ digit = 0 }) =>
      ngettext(msgid`${n2w(digit)} number`, `${n2w(digit)} numbers`, digit),
  },
  special: {
    test: makeRegexTest("special", /[^a-zA-Z0-9]/g),
    description: ({ special = 0 }) =>
      ngettext(
        msgid`${n2w(special)} special character`,
        `${n2w(special)} special characters`,
        special,
      ),
  },
};

function makeRegexTest(property, regex) {
  return (requirements, password = "") =>
    (password.match(regex) || []).length >= (requirements[property] || 0);
}

export default new Settings(_.clone(window.MetabaseBootstrap));
