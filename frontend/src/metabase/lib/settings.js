import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
import MetabaseUtils from "metabase/lib/utils";

const mb_settings = _.clone(window.MetabaseBootstrap);

const settingListeners = {};

// provides access to Metabase application settings
const MetabaseSettings = {
  get(propName, defaultValue = null) {
    return mb_settings[propName] !== undefined
      ? mb_settings[propName]
      : defaultValue;
  },

  set(key, value) {
    if (mb_settings[key] !== value) {
      mb_settings[key] = value;
      if (settingListeners[key]) {
        for (const listener of settingListeners[key]) {
          setTimeout(() => listener(value));
        }
      }
    }
  },

  setAll(settings) {
    for (const key in settings) {
      MetabaseSettings.set(key, settings[key]);
    }
  },

  // these are all special accessors which provide a lookup of a property plus some additional help
  adminEmail() {
    return mb_settings.admin_email;
  },

  isEmailConfigured() {
    return mb_settings.email_configured;
  },

  isTrackingEnabled() {
    return mb_settings.anon_tracking_enabled || false;
  },

  hasSetupToken() {
    return (
      mb_settings.setup_token !== undefined && mb_settings.setup_token !== null
    );
  },

  ssoEnabled() {
    return mb_settings.google_auth_client_id != null;
  },

  ldapEnabled() {
    return mb_settings.ldap_configured;
  },

  hideEmbedBranding() {
    return mb_settings.hide_embed_branding;
  },

  metastoreUrl() {
    return mb_settings.metastore_url;
  },

  docsUrl(page = "", anchor = "") {
    let { tag } = MetabaseSettings.get("version", {});
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
  },

  newVersionAvailable(settings) {
    let versionInfo = _.findWhere(settings, { key: "version-info" });
    const currentVersion = MetabaseSettings.get("version").tag;

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
  },

  // returns a map that looks like {total: 6, digit: 1}
  passwordComplexityRequirements() {
    return this.get("password_complexity", {});
  },

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
  },

  on(setting, callback) {
    settingListeners[setting] = settingListeners[setting] || [];
    settingListeners[setting].push(callback);
  },
};

const n2w = MetabaseUtils.numberToWord;

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

export default MetabaseSettings;
