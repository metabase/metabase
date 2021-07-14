import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import MetabaseUtils from "metabase/lib/utils";
import moment from "moment";

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
  | "enable-enhancements?"
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
  | "search-typeahead-enabled"
  | "setup-token"
  | "site-url"
  | "types"
  | "version"
  | "version-info"
  | "version-info-last-checked";

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

  enhancementsEnabled() {
    return this.get("enable-enhancements?");
  }

  isEmailConfigured() {
    return this.get("email-configured?");
  }

  // Right now, all Metabase Cloud hosted instances run on *.metabaseapp.com
  // We plan on changing this to look at an envvar in the future instead.
  isHosted() {
    // matches <custom>.metabaseapp.com and <custom>.metabaseapp.com/
    return /.+\.metabaseapp.com\/?$/i.test(this.get("site-url"));
  }

  googleAuthEnabled() {
    return this.get("google-auth-client-id") != null;
  }

  hasSetupToken() {
    return this.get("setup-token") != null;
  }

  hideEmbedBranding() {
    return this.get("hide-embed-branding?");
  }

  ldapEnabled() {
    return this.get("ldap-configured?");
  }

  searchTypeaheadEnabled() {
    return this.get("search-typeahead-enabled");
  }

  ssoEnabled() {
    return this.get("google-auth-client-id") != null;
  }

  trackingEnabled() {
    return this.get("anon-tracking-enabled") || false;
  }

  formattingOptions() {
    const opts = this.get("custom-formatting");
    return opts && opts["type/Temporal"] ? opts["type/Temporal"] : {};
  }

  versionInfoLastChecked() {
    const ts = this.get("version-info-last-checked");
    if (ts) {
      // app DB stores this timestamp in UTC, so convert it to the local zone to render
      return moment
        .utc(parseTimestamp(ts))
        .local()
        .format("MMMM Do YYYY, h:mm:ss a");
    } else {
      return t`never`;
    }
  }

  docsUrl(page = "", anchor = "") {
    let { tag } = this.get("version", {});
    if (/^v1\.\d+\.\d+$/.test(tag)) {
      // if it's a normal EE version, link to the corresponding CE docs
      tag = tag.replace("v1", "v0");
    } else if (!tag || /v1/.test(tag) || /SNAPSHOT$/.test(tag)) {
      // if there's no tag or it's an EE version that might not have a matching CE version, or it's a local build, link to latest
      tag = "latest";
    }
    if (page) {
      page = `${page}.html`;
    }
    if (anchor) {
      anchor = `#${anchor}`;
    }
    return `https://www.metabase.com/docs/${tag}/${page}${anchor}`;
  }

  newVersionAvailable() {
    const result = MetabaseUtils.compareVersions(
      this.currentVersion(),
      this.latestVersion(),
    );
    return result != null && result < 0;
  }

  versionIsLatest() {
    const result = MetabaseUtils.compareVersions(
      this.currentVersion(),
      this.latestVersion(),
    );
    return result != null && result >= 0;
  }

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
  }

  currentVersion() {
    return this.get("version", {}).tag;
  }

  latestVersion() {
    const { latest } = this.versionInfo();
    return latest && latest.version;
  }

  isEnterprise() {
    return false;
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
    const includes = Object.values(rest).join(", ");
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
