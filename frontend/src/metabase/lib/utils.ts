import { t } from "ttag";
import _ from "underscore";

import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import type { EntityToken } from "metabase-types/api/entity";

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

export function isJWT(string: unknown): string is string {
  return (
    typeof string === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(string)
  );
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
  ].map((part) => (typeof part === "string" ? parseInt(part, 10) : part));
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

export function newVersionAvailable({
  currentVersion,
  latestVersion,
}: {
  currentVersion: string;
  latestVersion: string;
}) {
  const result = compareVersions(currentVersion, latestVersion);
  return result != null && result < 0;
}

export function versionIsLatest({
  currentVersion,
  latestVersion,
}: {
  currentVersion: string;
  latestVersion: string;
}) {
  const result = compareVersions(currentVersion, latestVersion);
  return result != null && result >= 0;
}

/**
 * @deprecated
 * In most cases we want to use specific token features, not the type of build.
 * Use only we want to display something differently based on specifically the build,
 * ie: "Switch binary" vs "Put a valid token in the settings"
 */
export const isEEBuild = () => PLUGIN_IS_EE_BUILD.isEEBuild();

// Extract resource id from signed JWT token used in Static Embedding
export const extractResourceIdFromJwtToken = (jwtToken: EntityToken) => {
  try {
    const parts = jwtToken.split(".");
    const payloadPart = parts[1];

    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;

    if (padding === 2) {
      base64 += "==";
    } else if (padding === 3) {
      base64 += "=";
    } else if (padding !== 0) {
      throw new Error("Invalid base64url payload");
    }

    const jsonString = decodeURIComponent(
      Array.from(window.atob(base64))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = JSON.parse(jsonString);
    const resource = payload.resource;
    const entityId = resource.dashboard || resource.question;

    return entityId;
  } catch {
    return null;
  }
};
