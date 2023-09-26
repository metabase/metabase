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

export function stripLayoutProps(props: unknown) {
  return _.omit(props, LAYOUT_PROPS);
}

function s4() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}

export function isEmpty(str: string | null) {
  if (str != null) {
    str = String(str);
  } // make sure 'str' is actually a string
  return str == null || 0 === str.length || str.match(/^\s+$/) != null;
}

// pretty limited.  just does 0-9 for right now.
export function numberToWord(num: number) {
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
}

export function uuid() {
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
}

export function isUUID(uuid: unknown) {
  return (
    typeof uuid === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)
  );
}

export function isJWT(string: unknown) {
  return (
    typeof string === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(string)
  );
}

export function isEmail(email: string | undefined | null) {
  if (email === null || email === undefined) {
    return false;
  }
  return EMAIL_REGEX.test(email);
}

export function getEmailDomain(email: string) {
  const match = EMAIL_REGEX.exec(email);
  return match && match[5];
}

export function equals(a: unknown, b: unknown) {
  return _.isEqual(a, b);
}

export function propertiesEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  properties = [...Object.keys(a), ...Object.keys(b)],
) {
  for (const property of properties) {
    if (a[property] !== b[property]) {
      return false;
    }
  }
  return true;
}

export function copy(a: unknown) {
  // FIXME: ugghhhhhhhhh
  return JSON.parse(JSON.stringify(a));
}

/**
 * Converts a metabase version to a list of numeric components, it converts pre-release
 * components to numbers and pads the numeric part to 4 numbers to make comparison easier
 */
export function versionToNumericComponents(version: string): number[] | null {
  const SPECIAL_COMPONENTS: Record<string, number> = {
    snapshot: -4,
    alpha: -3,
    beta: -2,
    rc: -1,
  };

  const regex =
    /v?(?<ossOrEE>\d+)\.?(?<major>\d+)?\.?(?<minor>\d+)?\.?(?<patch>\d+)?-?(?<label>\D+)?(?<build>\d+)?/;

  const result = regex.exec(version);

  if (!result || !result.groups) {
    return null;
  }

  const {
    ossOrEE,
    major = 0,
    minor = 0,
    patch = 0,
    label,
    build = 0,
  } = result.groups;

  return [
    ossOrEE,
    major,
    minor,
    patch,
    SPECIAL_COMPONENTS[label?.toLowerCase()] ?? 0,
    build,
  ].map(part => (typeof part === "string" ? parseInt(part, 10) : part));
}

/**
 * this should correctly compare all version formats Metabase uses, e.g.
 * 0.0.9, 0.0.10-snapshot, 0.0.10-alpha1, 0.0.10-rc1, 0.0.10-rc2, 0.0.10-rc10
 * 0.0.10, 0.1.0, 0.2.0, 0.10.0, 1.1.0
 */
export function compareVersions(aVersion: string, bVersion: string): -1 | 0 | 1;
export function compareVersions(
  aVersion: string | null | undefined,
  bVersion: string | null | undefined,
): null;
export function compareVersions(
  aVersion: string | null | undefined,
  bVersion: string | null | undefined,
): -1 | 0 | 1 | null {
  if (!aVersion || !bVersion) {
    return null;
  }

  const aComponents = versionToNumericComponents(aVersion);
  const bComponents = versionToNumericComponents(bVersion);

  if (!aComponents || !bComponents) {
    return null;
  }

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
}
