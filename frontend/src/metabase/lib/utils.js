import { t } from "ttag";
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

const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

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

  isEmail(email) {
    return EMAIL_REGEX.test(email);
  },

  getEmailDomain(email) {
    const match = EMAIL_REGEX.exec(email);
    return match && match[5];
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
};

export default MetabaseUtils;
