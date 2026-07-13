import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

/**
 * Read + parse the app's `data_app.yml`/`.yaml` manifest.
 * Returns null when the app has no manifest.
 */
export function readManifest(
  appRoot: string,
): { manifestPath: string; manifest: Record<string, unknown> } | null {
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

  return {
    manifestPath,
    manifest:
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {},
  };
}

export function readAppSlug(appRoot: string): string {
  const slug = readManifest(appRoot)?.manifest.slug;

  return typeof slug === "string" ? slug.trim() : "";
}
