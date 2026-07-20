import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { DATA_APP_MANIFEST_FILE_NAME } from "../constants/paths";
import type { DataAppManifestStatus } from "../types/manifest-status";

// Deliberately not a validator. The rules for a manifest — slug shape, reserved
// slugs, required fields, what counts as an allowed_hosts entry — live in the
// backend's `parse-app-config`, and a second copy here would drift into telling
// authors something the sync disagrees with. This reports what the file says,
// plus the two things the backend cannot see: what is on this machine's disk,
// and what the dev server booted with.

const asDisplayString = (value: unknown): string | null => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Both lists are the manifest's `allowed_hosts` as written — the booted one was
 * read the same way — so comparing them needs no notion of a *valid* entry, only
 * that padding and ordering shouldn't demand a restart that changes nothing.
 */
const sameHosts = (left: string[], right: string[]): boolean => {
  const normalize = (hosts: string[]) =>
    hosts
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .sort();

  const [a, b] = [normalize(left), normalize(right)];

  return a.length === b.length && a.every((entry, index) => entry === b[index]);
};

export function validateDataAppManifest(
  appRoot: string,
  startupAllowedHosts: string[],
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

  status.name = asDisplayString(manifestValue("name"));
  status.bundlePath = asDisplayString(manifestValue("path"));

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

  status.restartRequired = !sameHosts(status.allowedHosts, startupAllowedHosts);

  return status;
}
