import generatePassword from "password-generator";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import _ from "underscore";

const LAYOUT_PROPS = [
  "m",
  "ml",
  "mr",
  "mt",
  "mb",
  "mx",
  "my",
  "p",
  "pl",
  "pr",
  "pt",
  "pb",
  "px",
  "py",
  "bg",
  "color",
  "hover",
  "bordered",
];

export function stripLayoutProps(props) {
  return _.omit(props, LAYOUT_PROPS);
}

function s4() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}

// provides functions for building urls to things we care about
const MetabaseUtils = {
  // generate a password that satisfies `complexity` requirements, by default the ones that come back in the
  // `password-complexity` Setting; must be a map like {total: 6, number: 1}
  generatePassword(complexity) {
    complexity =
      complexity || MetabaseSettings.passwordComplexityRequirements() || {};
    // generated password must be at least `complexity.total`, but can be longer
    // so hard code a minimum of 14
    const len = Math.max(complexity.total || 0, 14);

    let password = "";
    let tries = 0;
    while (!isStrongEnough(password) && tries < 100) {
      password = generatePassword(len, false, /[\w\d\?\-]/);
      tries++;
    }
    return password;

    function isStrongEnough(password) {
      const uc = password.match(/([A-Z])/g);
      const lc = password.match(/([a-z])/g);
      const di = password.match(/([\d])/g);
      const sc = password.match(/([!@#\$%\^\&*\)\(+=._-{}])/g);

      return (
        uc &&
        uc.length >= (complexity.upper || 0) &&
        lc &&
        lc.length >= (complexity.lower || 0) &&
        di &&
        di.length >= (complexity.digit || 0) &&
        sc &&
        sc.length >= (complexity.special || 0)
      );
    }
  },

  isEmpty(str) {
    if (str != null) {
      str = String(str);
    } // make sure 'str' is actually a string
    return str == null || 0 === str.length || str.match(/^\s+$/) != null;
  },

  // pretty limited.  just does 0-9 for right now.
  numberToWord(num) {
    const names = [
      t`zero`,
      t`one`,
      t`two`,
      t`three`,
      t`four`,
      t`five`,
      t`six`,
      t`seven`,
      t`eight`,
      t`nine`,
    ];

    if (num >= 0 && num <= 9) {
      return names[num];
    } else {
      return "" + num;
    }
  },

  uuid() {
    return (
      s4() +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      s4() +
      s4()
    );
  },

  isUUID(uuid) {
    return (
      typeof uuid === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        uuid,
      )
    );
  },

  isBase64(string) {
    return (
      typeof string === "string" &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        string,
      )
    );
  },

  isJWT(string) {
    return (
      typeof string === "string" &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(string)
    );
  },

  validEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  },

  equals(a, b) {
    return _.isEqual(a, b);
  },

  propertiesEqual(a, b, properties = [...Object.keys(a), ...Object.keys(b)]) {
    for (const property of properties) {
      if (a[property] !== b[property]) {
        return false;
      }
    }
    return true;
  },

  copy(a) {
    // FIXME: ugghhhhhhhhh
    return JSON.parse(JSON.stringify(a));
  },

  // this should correctly compare all version formats Metabase uses, e.x.
  // 0.0.9, 0.0.10-snapshot, 0.0.10-alpha1, 0.0.10-rc1, 0.0.10-rc2, 0.0.10-rc10
  // 0.0.10, 0.1.0, 0.2.0, 0.10.0, 1.1.0
  compareVersions(aVersion, bVersion) {
    if (!aVersion || !bVersion) {
      return null;
    }

    const SPECIAL_COMPONENTS = {
      snapshot: -4,
      alpha: -3,
      beta: -2,
      rc: -1,
    };

    const getComponents = x =>
      // v1.2.3-BETA1
      x
        .toLowerCase()
        // v1.2.3-beta1
        .replace(/^v/, "")
        // 1.2.3-beta1
        .split(/[.-]*([0-9]+)[.-]*/)
        .filter(c => c)
        // ["1", "2", "3", "beta", "1"]
        .map(c => SPECIAL_COMPONENTS[c] || parseInt(c, 10));
    // [1, 2, 3, -2, 1]

    const aComponents = getComponents(aVersion);
    const bComponents = getComponents(bVersion);
    for (let i = 0; i < Math.max(aComponents.length, bComponents.length); i++) {
      const a = aComponents[i];
      const b = bComponents[i];
      if (b == null || a < b) {
        return -1;
      } else if (a == null || b < a) {
        return 1;
      }
    }
    return 0;
  },
};

export default MetabaseUtils;
