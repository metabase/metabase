import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { DATA_APP_MANIFEST_FILE_NAME } from "../constants/paths";
import type { DataAppManifestStatus } from "../types/manifest-status";

const asNonEmptyString = (value: unknown): string | null => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
};

const compareAllowedHosts = (
  prevHosts: string[],
  nextHosts: string[],
): boolean => {
  const normalize = (hosts: string[]) =>
    hosts
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .sort();

  const [prev, next] = [normalize(prevHosts), normalize(nextHosts)];

  return (
    prev.length === next.length &&
    prev.every((entry, index) => entry === next[index])
  );
};

/**
 * Not a full validator: the manifest rules live in the backend's `parse-app-config`
 * and a copy here would drift. This only adds what the backend cannot see —
 * this machine's disk, and what the dev server booted with.
 */
export function validateDataAppManifest(
  appRoot: string,
  initialAllowedHosts: string[],
): DataAppManifestStatus {
  const status: DataAppManifestStatus = {
    checkedAt: Date.now(),
    name: null,
    bundlePath: null,
    bundlePathExists: false,
    allowedHosts: [],
    errors: [],
    warnings: [],
    restartRequired: false,
  };

  const manifestPath = path.join(appRoot, DATA_APP_MANIFEST_FILE_NAME);

  if (!fs.existsSync(manifestPath)) {
    status.errors.push(
      `No ${DATA_APP_MANIFEST_FILE_NAME} found — this app will not sync.`,
    );

    return status;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    status.errors.push(
      `Could not parse ${DATA_APP_MANIFEST_FILE_NAME}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return status;
  }

  const manifestValue = (key: string): unknown =>
    typeof parsed === "object" && parsed !== null
      ? Reflect.get(parsed, key)
      : undefined;

  status.name = asNonEmptyString(manifestValue("name"));
  status.bundlePath = asNonEmptyString(manifestValue("path"));

  if (status.bundlePath != null) {
    status.bundlePathExists = fs.existsSync(
      path.join(appRoot, status.bundlePath),
    );

    if (!status.bundlePathExists) {
      status.warnings.push(
        `"${status.bundlePath}" does not exist — run \`npm run build\` before committing, or sync will fail.`,
      );
    }
  }

  const rawHosts = manifestValue("allowed_hosts");

  status.allowedHosts = Array.isArray(rawHosts)
    ? rawHosts.map((entry) => String(entry))
    : [];

  status.restartRequired = !compareAllowedHosts(
    initialAllowedHosts,
    status.allowedHosts,
  );

  return status;
}
