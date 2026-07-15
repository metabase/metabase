import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

/**
 * The app's parsed `data_app.yml` manifest, validated and normalized:
 * `slug` is trimmed, `allowed_hosts` is guaranteed to be a list of strings.
 */
export type DataAppManifest = {
  slug?: string;
  allowed_hosts?: string[];
};

const isString = (value: unknown): value is string => typeof value === "string";

const parseAllowedHosts = (
  value: unknown,
  manifestPath: string,
): string[] | undefined => {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${manifestPath}: "allowed_hosts" must be a list.`);
  }

  if (!value.every(isString)) {
    const nonString = value.find((host) => !isString(host));

    throw new Error(
      `${manifestPath}: every "allowed_hosts" entry must be a string, got ${JSON.stringify(
        nonString,
      )}.`,
    );
  }

  return value;
};

/**
 * Read, parse, and normalize the app's `data_app.yml`/`.yaml` manifest.
 * Returns null when the app has no manifest.
 */
export const readManifest = (
  appRoot: string,
): { manifestPath: string; manifest: DataAppManifest } | null => {
  const manifestPath = [
    path.join(appRoot, "data_app.yaml"),
    path.join(appRoot, "data_app.yml"),
  ].find((candidate) => fs.existsSync(candidate));

  if (!manifestPath) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = parseYaml(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not parse ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const raw: { slug?: unknown; allowed_hosts?: unknown } =
    typeof parsed === "object" && parsed !== null ? parsed : {};

  return {
    manifestPath,
    manifest: {
      slug: isString(raw.slug) ? raw.slug.trim() : undefined,
      allowed_hosts: parseAllowedHosts(raw.allowed_hosts, manifestPath),
    },
  };
};
