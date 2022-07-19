import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import MetabaseUtils from "metabase/lib/utils";
import moment from "moment";

const n2w = (n: number) => MetabaseUtils.numberToWord(n);

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

// TODO: dump this from backend settings definitions
export type SettingName =
  | "admin-email"
  | "analytics-uuid"
  | "anon-tracking-enabled"
  | "site-locale"
  | "user-locale"
  | "available-locales"
  | "available-timezones"
  | "custom-formatting"
  | "custom-geojson"
  | "email-configured?"
  | "enable-embedding"
  | "enable-enhancements?"
  | "enable-public-sharing"
  | "enable-xrays"
  | "persisted-models-enabled"
  | "engines"
  | "ga-code"
  | "ga-enabled"
  | "google-auth-client-id"
  | "has-sample-database?"
  | "has-user-setup"
  | "hide-embed-branding?"
  | "is-hosted?"
  | "ldap-configured?"
  | "other-sso-configured?"
  | "enable-password-login"
  | "map-tile-server-url"
  | "password-complexity"
  | "persisted-model-refresh-interval-hours"
  | "premium-features"
  | "search-typeahead-enabled"
  | "setup-token"
  | "site-url"
  | "site-uuid"
  | "types"
  | "version-info-last-checked"
  | "version-info"
  | "version"
  | "subscription-allowed-domains"
  | "cloud-gateway-ips"
  | "snowplow-enabled"
  | "snowplow-url"
  | "deprecation-notice-version"
  | "show-database-syncing-modal"
  | "premium-embedding-token"
  | "metabase-store-managed"
  | "application-colors"
  | "application-font"
  | "available-fonts"
  | "enable-query-caching"
  | "start-of-week";

type SettingsMap = Record<SettingName, any>; // provides access to Metabase application settings

type SettingListener = (value: any) => void;

class Settings {
  _settings: Partial<SettingsMap>;
  _listeners: Partial<Record<SettingName, SettingListener[]>> = {};

  constructor(settings: Partial<SettingsMap> = {}) {
    this._settings = settings;
  }

  get(key: SettingName, defaultValue: any = null) {
    return this._settings[key] !== undefined
      ? this._settings[key]
      : defaultValue;
  }

  set(key: SettingName, value: any) {
    if (this._settings[key] !== value) {
      this._settings[key] = value;
      const listeners = this._listeners[key];

      if (!listeners) {
        return;
      }

      for (const listener of listeners) {
        setTimeout(() => listener(value));
      }
    }
  }

  setAll(settings: SettingsMap) {
    const keys = Object.keys(settings) as SettingName[];

    keys.forEach(key => {
      this.set(key, settings[key]);
    });
  }

  on(key: SettingName, callback: SettingListener) {
    this._listeners[key] = this._listeners[key] || [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._listeners[key]!.push(callback);
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

  isHosted(): boolean {
    return this.get("is-hosted?");
  }

  cloudGatewayIps(): string[] {
    return this.get("cloud-gateway-ips") || [];
  }

  hasUserSetup() {
    return this.get("has-user-setup");
  }

  hideEmbedBranding() {
    return this.get("hide-embed-branding?");
  }

  isGoogleAuthConfigured() {
    return this.get("google-auth-client-id") != null;
  }

  isLdapConfigured() {
    return this.get("ldap-configured?");
  }

  // JWT or SAML is configured
  isOtherSsoConfigured() {
    return this.get("other-sso-configured?");
  }

  isSsoConfigured() {
    return (
      this.isGoogleAuthConfigured() ||
      this.isLdapConfigured() ||
      this.isGoogleAuthConfigured()
    );
  }

  isPasswordLoginEnabled() {
    return this.get("enable-password-login");
  }

  searchTypeaheadEnabled() {
    return this.get("search-typeahead-enabled");
  }

  trackingEnabled() {
    return this.get("anon-tracking-enabled") || false;
  }

  googleAnalyticsEnabled() {
    return this.get("ga-enabled") || false;
  }

  snowplowEnabled() {
    return this.get("snowplow-enabled") || false;
  }

  snowplowUrl() {
    return this.get("snowplow-url");
  }

  deprecationNoticeVersion() {
    return this.get("deprecation-notice-version");
  }

  deprecationNoticeEnabled() {
    return this.currentVersion() !== this.deprecationNoticeVersion();
  }

  token() {
    return this.get("premium-embedding-token");
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
    const matches = tag && tag.match(/v[01]\.(\d+)(?:\.\d+)?(-.*)?/);

    if (matches) {
      if (
        matches.length > 2 &&
        matches[2] &&
        "-snapshot" === matches[2].toLowerCase()
      ) {
        // always point -SNAPSHOT suffixes to "latest", since this is likely a development build off of master
        tag = "latest";
      } else {
        // otherwise, it's a regular OSS or EE version string, just link to the major OSS doc link
        tag = "v0." + matches[1];
      }
    } else {
      // otherwise, just link to the latest tag
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

  storeUrl(path = "") {
    return `https://store.metabase.com/${path}`;
  }

  upgradeUrl() {
    return "https://www.metabase.com/upgrade/";
  }

  migrateToCloudGuideUrl() {
    return "https://www.metabase.com/cloud/docs/migrate/guide";
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

  isPaidPlan() {
    return this.isHosted() || this.isEnterprise();
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
    const descriptions: Record<string, string> = {};

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

  subscriptionAllowedDomains() {
    const setting = this.get("subscription-allowed-domains") || "";
    return setting ? setting.split(",") : [];
  }
}

function makeRegexTest(property: string, regex: RegExp) {
  return (requirements: Record<string, any>, password = "") =>
    (password.match(regex) || []).length >= (requirements[property] || 0);
}

export default new Settings(_.clone(window.MetabaseBootstrap));
