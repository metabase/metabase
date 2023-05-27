import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
import moment from "moment-timezone";

import { parseTimestamp } from "metabase/lib/time";
import MetabaseUtils from "metabase/lib/utils";

import { PasswordComplexity, SettingKey, Settings } from "metabase-types/api";

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

type SettingListener = (value: any) => void;

class MetabaseSettings {
  _settings: Partial<Settings>;
  _listeners: Partial<{ [key: string]: SettingListener[] }> = {};

  constructor(settings: Partial<Settings> = {}) {
    this._settings = settings;
  }

  get<T extends SettingKey>(key: T): Partial<Settings>[T] {
    return this._settings[key];
  }

  set<T extends SettingKey>(key: T, value: Settings[T]) {
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

  setAll(settings: Settings) {
    const keys = Object.keys(settings) as SettingKey[];

    keys.forEach(key => {
      this.set(key, settings[key]);
    });
  }

  on(key: SettingKey, callback: SettingListener) {
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

  isEmailConfigured(): boolean {
    return !!this.get("email-configured?");
  }

  isHosted(): boolean {
    return !!this.get("is-hosted?");
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

  isGoogleAuthEnabled() {
    return this.get("google-auth-enabled");
  }

  isLdapEnabled() {
    return this.get("ldap-enabled");
  }

  isLdapConfigured() {
    return this.get("ldap-configured?");
  }

  // JWT or SAML is enabled
  isOtherSsoEnabled() {
    return this.get("other-sso-enabled?");
  }

  isSsoEnabled() {
    return (
      this.isLdapEnabled() ||
      this.isGoogleAuthEnabled() ||
      this.isOtherSsoEnabled()
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

  uploadsEnabled() {
    return !!(this.get("uploads-enabled") && this.get("uploads-database-id"));
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
    let { tag } = this.get("version") || {};
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

  learnUrl(path = "") {
    return `https://www.metabase.com/learn/${path}`;
  }

  storeUrl(path = "") {
    return `https://store.metabase.com/${path}`;
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

  versionInfo() {
    return this.get("version-info") || {};
  }

  currentVersion() {
    const version = this.get("version") || {};
    return version.tag;
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

  isMetabotEnabled() {
    return this.get("is-metabot-enabled");
  }

  passwordComplexityRequirements(): PasswordComplexity {
    return this.get("password-complexity") || {};
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

  subscriptionAllowedDomains(): string[] {
    const setting = this.get("subscription-allowed-domains") || "";
    return setting ? setting.split(",") : [];
  }
}

function makeRegexTest(property: string, regex: RegExp) {
  return (requirements: Record<string, any>, password = "") =>
    (password.match(regex) || []).length >= (requirements[property] || 0);
}

// window is not defined for static charts SSR
const initValues =
  typeof window !== "undefined" ? _.clone(window.MetabaseBootstrap) : null;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default new MetabaseSettings(initValues);
