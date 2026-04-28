import _ from "underscore";

import type {
  ColorSettings,
  PasswordComplexity,
  SettingKey,
  Settings,
} from "metabase-types/api";

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

    keys.forEach((key) => {
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
   * @deprecated remove an event listener
   */
  off(key: SettingKey, callback: SettingListener) {
    this._listeners[key] =
      this._listeners[key]?.filter((c) => c !== callback) || [];
  }

  /**
   * @deprecated use getSetting(state, "admin-email")
   */
  adminEmail() {
    return this.get("admin-email");
  }

  /**
   * @deprecated use getSetting(state, "enable-sandboxes?")
   */
  sandboxingEnabled() {
    return this.get("enable-sandboxes?");
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

  /**
   * @deprecated use getSetting(state, "password-complexity")
   */
  passwordComplexityRequirements(): PasswordComplexity {
    return this.get("password-complexity") || {};
  }

  /**
   * @deprecated use getSetting(state, "subscription-allowed-domains")
   */
  subscriptionAllowedDomains(): string[] {
    const setting = this.get("subscription-allowed-domains") || "";
    return setting ? setting.split(",") : [];
  }

  /**
   * @deprecated use getSetting(state, "application-colors")
   *
   * Only use this when Redux store is not always available, e.g. in ThemeProvider
   */
  applicationColors(): ColorSettings {
    return this.get("application-colors" as SettingKey) as ColorSettings;
  }
}

// window is not defined for static charts SSR
const initValues =
  typeof window !== "undefined" ? _.clone(window.MetabaseBootstrap) : null;

const settings = new MetabaseSettings(initValues);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default settings;
