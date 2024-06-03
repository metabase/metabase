import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { parseTimestamp } from "metabase/lib/time";
import { numberToWord, compareVersions } from "metabase/lib/utils";
import { getDocsUrlForVersion } from "metabase/selectors/settings";
import type {
  PasswordComplexity,
  SettingKey,
  Settings,
} from "metabase-types/api";

const n2w = (n: number) => numberToWord(n);

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

  /**
   * @deprecated use getSetting(state, key)
   */
  get<T extends SettingKey>(key: T): Partial<Settings>[T] {
    return this._settings[key];
  }

  /**
   * @deprecated set setting values in the redux store
   */
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

  /**
   * @deprecated set setting values in the redux store
   */
  setAll(settings: Settings) {
    const keys = Object.keys(settings) as SettingKey[];

    keys.forEach(key => {
      this.set(key, settings[key]);
    });
  }

  /**
   * @deprecated call appropriate actions when modifying the setting
   */
  on(key: SettingKey, callback: SettingListener) {
    this._listeners[key] = this._listeners[key] || [];
    this._listeners[key]!.push(callback);
  }

  /**
   * @deprecated use getSetting(state, "admin-email")
   */
  adminEmail() {
    return this.get("admin-email");
  }

  /**
   * @deprecated use getSetting(state, "enable-enhancements?")
   */
  enhancementsEnabled() {
    return this.get("enable-enhancements?");
  }

  /**
   * @deprecated use getSetting(state, "email-configured?")
   */
  isEmailConfigured(): boolean {
    return !!this.get("email-configured?");
  }

  /**
   * @deprecated use getSetting(state, "is-hosted?")
   */
  isHosted(): boolean {
    return !!this.get("is-hosted?");
  }

  /**
   * @deprecated use getSetting(state, "cloud-gateway-ips")
   */
  cloudGatewayIps(): string[] {
    return this.get("cloud-gateway-ips") || [];
  }

  /**
   * @deprecated use getSetting(state, "has-user-setup")
   */
  hasUserSetup() {
    return this.get("has-user-setup");
  }

  /**
   * @deprecated use getSetting(state, "hide-embed-branding?")
   */
  hideEmbedBranding() {
    return this.get("hide-embed-branding?");
  }

  /**
   * @deprecated use getSetting(state, "google-auth-enabled")
   */
  isGoogleAuthEnabled() {
    return this.get("google-auth-enabled");
  }

  /**
   * @deprecated use getSetting(state, "ldap-enabled")
   */
  isLdapEnabled() {
    return this.get("ldap-enabled");
  }

  /**
   * @deprecated use getSetting(state, "ldap-configured?")
   */
  isLdapConfigured() {
    return this.get("ldap-configured?");
  }

  /**
   * @deprecated use getSetting(state, "other-sso-enabled?")
   */
  isOtherSsoEnabled() {
    return this.get("other-sso-enabled?");
  }

  /**
   * @deprecated use getSetting(state, ...)
   */
  isSsoEnabled() {
    return (
      this.isLdapEnabled() ||
      this.isGoogleAuthEnabled() ||
      this.isOtherSsoEnabled()
    );
  }

  /**
   * @deprecated use getSetting(state, "enable-password-login")
   */
  isPasswordLoginEnabled() {
    return this.get("enable-password-login");
  }

  /**
   * @deprecated use getSetting(state, "anon-tracking-enabled")
   */
  trackingEnabled() {
    return this.get("anon-tracking-enabled") || false;
  }

  /**
   * @deprecated use getSetting(state, "anon-tracking-enabled")
   */
  uploadsEnabled() {
    return !!this.get("uploads-settings")?.db_id;
  }

  /**
   * @deprecated use getSetting(state, "snowplow-enabled")
   */
  snowplowEnabled() {
    return this.get("snowplow-enabled") || false;
  }

  /**
   * @deprecated use getSetting(state, "snowplow-url")
   */
  snowplowUrl() {
    return this.get("snowplow-url");
  }

  /**
   * @deprecated use getSetting(state, "deprecation-notice-version")
   */
  deprecationNoticeVersion() {
    return this.get("deprecation-notice-version");
  }

  deprecationNoticeEnabled() {
    return this.currentVersion() !== this.deprecationNoticeVersion();
  }

  /**
   * @deprecated use getSetting(state, "premium-embedding-token")
   */
  token() {
    return this.get("premium-embedding-token");
  }

  /**
   * @deprecated use getSetting(state, "custom-formatting")
   */
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

  /**
   * @deprecated use getDocsUrl
   */
  docsUrl(page = "", anchor = "") {
    return getDocsUrlForVersion(this.get("version"), page, anchor);
  }

  /**
   * @deprecated use getLearnUrl
   */
  learnUrl(path = "") {
    // eslint-disable-next-line no-unconditional-metabase-links-render -- This is the implementation of MetabaseSettings.learnUrl()
    return `https://www.metabase.com/learn/${path}`;
  }

  /**
   * @deprecated use getStoreUrl
   */
  storeUrl(path = "") {
    return `https://store.metabase.com/${path}`;
  }

  migrateToCloudGuideUrl() {
    return "https://www.metabase.com/cloud/docs/migrate/guide";
  }

  newVersionAvailable() {
    const result = compareVersions(this.currentVersion(), this.latestVersion());
    return result != null && result < 0;
  }

  versionIsLatest() {
    const result = compareVersions(this.currentVersion(), this.latestVersion());
    return result != null && result >= 0;
  }

  /**
   * @deprecated use getSetting(state, "version-info")
   */
  versionInfo() {
    return this.get("version-info") || {};
  }

  /**
   * @deprecated use getSetting(state, "version")
   */
  currentVersion() {
    const version = this.get("version") || {};
    return version.tag;
  }

  /**
   * @deprecated use getSetting(state, "version-info")
   */
  latestVersion() {
    const { latest } = this.versionInfo();
    return latest && latest.version;
  }

  /**
   * @deprecated use getSetting(state, "is-metabot-enabled")
   */
  isMetabotEnabled() {
    return this.get("is-metabot-enabled");
  }

  /**
   * @deprecated use getSetting(state, "password-complexity")
   */
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

  /**
   * @deprecated use getSetting(state, "subscription-allowed-domains")
   */
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

const settings = new MetabaseSettings(initValues);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default settings;
