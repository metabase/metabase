/**
 * Generates docs/util/data/nav.yml from a docs.metabase.github.io nav file, for
 * .github/workflows/docs-nav-seed.yml.
 *
 * Reads the nav file at SOURCE_FILE and rewrites every "url:" value with two transforms:
 *  1. strips the URL_PREFIX (e.g. "/docs/v0.44/" or "/docs/latest/") the source site prefixes
 *     versioned urls with, since this file's urls should be relative to the docs root instead.
 *  2. drops a trailing "/index" segment, since a directory url and its "/index" page resolve to
 *     the same place.
 *
 *   SOURCE_FILE=docs-site/_data/docs/nav/latest.yml URL_PREFIX=/docs/latest/ \
 *     bun .github/scripts/docs-nav-seed-generate.ts
 *
 * To run against a local docs.metabase.github.io checkout, just point SOURCE_FILE at it:
 *
 *   SOURCE_FILE=../docs.metabase.github.io/_data/docs/nav/latest.yml URL_PREFIX=/docs/latest/ bun .github/scripts/docs-nav-seed-generate.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE_FILE = process.env.SOURCE_FILE;
const URL_PREFIX = process.env.URL_PREFIX;

if (!SOURCE_FILE || !URL_PREFIX) {
  throw new Error(
    "docs-nav-seed-generate: SOURCE_FILE and URL_PREFIX must both be set",
  );
}

const destPath = "docs/util/data/nav.yml";

function transformUrl(url: string): string {
  const stripped = url.startsWith(URL_PREFIX!)
    ? url.slice(URL_PREFIX!.length)
    : url;
  return stripped.replace(/\/index$/, "");
}

const content = readFileSync(SOURCE_FILE, "utf8");

const transformed = content.replace(
  /^(\s*url:\s*")([^"]*)(")/gm,
  (_match, prefix, url, suffix) => `${prefix}${transformUrl(url)}${suffix}`,
);

mkdirSync("docs/util/data", { recursive: true });
writeFileSync(destPath, transformed);

process.stdout.write(`Generated ${destPath} from ${SOURCE_FILE}\n`);
