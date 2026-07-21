/**
 * Aggregates per-spec raw coverage written by the after:spec hook in
 * e2e/support/config.js into the manifests used for selective e2e runs:
 *
 *  - spec-file-manifest.json: { builtAt, specs: {spec: [files]},
 *    routes: {spec: [normalized API routes]} }
 *  - spec-test-manifest.json: { builtAt, specs: {spec: {testTitle:
 *    {files, routes}}} } — the per-test breakdown of the same data.
 *
 * For files, includes only those whose function counters strictly exceeded
 * the baseline spec's (per test: the baseline spec's single test).
 * This strips boot noise. Files where every function fired the same count in baseline
 * and spec are treated as "loaded but not exercised by this spec."
 *
 * The manifests store files and route shapes, not modules; the test planner
 * can map those to modules later.
 *
 * `builtAt` records the commit the instrumented run was built from, so an old
 * PR can pick the manifest closest to its own point in history rather than a
 * newer one whose file tree has since drifted.
 *
 * Backfill: a spec missing from today's coverage (its shard failed or flaked)
 * keeps its entry from the previous manifests
 *
 * Run after a full instrumented e2e pass:
 *   INSTRUMENT_COVERAGE=true bun run build-release:js
 *   <run cypress, including the coverage-baseline spec>
 *   node e2e/coverage/build-coverage-manifest.mjs
 *
 * Output: e2e/coverage/spec-file-manifest.json and
 * e2e/coverage/spec-test-manifest.json
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASELINE_SPEC,
  listSpecFiles,
} from "../../.github/scripts/e2e-spec-globs.mjs";

import {
  baselinePerTestDeltas,
  discriminatingFiles,
  discriminatingFilesForTest,
} from "./baseline.mjs";
import { loadRouteTable, matchRoute, normalizeRoutes } from "./routes.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Authoritative route shapes, generated from the backend's defendpoint
// definitions. Missing (e.g. a checkout without a generated spec) just means
// regex-fallback normalization for every route.
const OPENAPI_FILE = path.join(REPO_ROOT, "resources/openapi/openapi.json");

const PER_SPEC_DIR = path.join(REPO_ROOT, "e2e/coverage-manifest-raw");
const OUTPUT_FILE = path.join(
  REPO_ROOT,
  "e2e/coverage/spec-file-manifest.json",
);
const OUTPUT_TEST_FILE = path.join(
  REPO_ROOT,
  "e2e/coverage/spec-test-manifest.json",
);

function readEntry(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(
      `Skipping unreadable coverage entry ${file}: ${error.message}`,
    );
    return null;
  }
}

// The previous nightly's manifests (downloaded by the merge job) used to
// backfill specs missing from today's run. Missing/unparseable means no
// backfill. The per-test manifest travels in the same artifact next to the
// main one; its absence (e.g. the previous nightly predates per-test capture)
// just means no per-test backfill.
function loadPrevManifests() {
  const file = process.env.PREV_MANIFEST;
  if (!file || !fs.existsSync(file)) {
    return null;
  }
  let main;
  try {
    main = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!main?.specs || typeof main.specs !== "object") {
    return null;
  }

  let tests = {};
  try {
    const testFile = path.join(
      path.dirname(file),
      path.basename(OUTPUT_TEST_FILE),
    );
    if (fs.existsSync(testFile)) {
      const parsed = JSON.parse(fs.readFileSync(testFile, "utf8"));
      tests =
        parsed?.specs && typeof parsed.specs === "object" ? parsed.specs : {};
    }
  } catch {
    tests = {};
  }

  return { specs: main.specs, routes: main.routes ?? {}, tests };
}

// The commit this manifest describes. CI passes the instrumented build's SHA;
// fall back to HEAD for local runs.
function builtAtSha() {
  const fromEnv = process.env.MANIFEST_SHA || process.env.GITHUB_SHA;
  if (fromEnv) {
    return fromEnv.trim();
  }
  return execSync("git rev-parse HEAD", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function main() {
  if (!fs.existsSync(PER_SPEC_DIR)) {
    console.error(`No per-spec coverage at ${PER_SPEC_DIR}.`);
    console.error("Run the instrumented Cypress pass first.");
    process.exit(1);
  }

  // Load every per-spec entry, find the baseline.
  const entries = {};
  for (const file of fs.readdirSync(PER_SPEC_DIR)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const entry = readEntry(path.join(PER_SPEC_DIR, file));
    if (entry) {
      entries[entry.spec] = entry;
    }
  }

  const baseline = entries[BASELINE_SPEC];
  if (!baseline) {
    console.error(
      `Baseline spec ${BASELINE_SPEC} missing from raw coverage. Did it run?`,
    );
    process.exit(1);
  }

  const baselineTestDeltas = baselinePerTestDeltas(baseline);

  const routeTable = loadRouteTable(OPENAPI_FILE);
  if (!routeTable) {
    console.warn(
      `No OpenAPI spec at ${OPENAPI_FILE}; using regex route normalization.`,
    );
  }

  const specs = {};
  const specRoutes = {};
  const specTests = {};
  let totalFiles = 0;
  let totalTests = 0;
  for (const [spec, entry] of Object.entries(entries)) {
    if (spec === BASELINE_SPEC) {
      continue;
    }
    const files = discriminatingFiles(
      entry.coverage,
      baseline.coverage,
      REPO_ROOT,
    );
    specs[spec] = files;
    totalFiles += files.length;

    // Per-test breakdown. Retried attempts share a title; their files and
    // routes union together.
    const tests = {};
    const routes = new Set();
    for (const attempt of entry.tests ?? []) {
      const test = (tests[attempt.title] ??= {
        files: new Set(),
        routes: new Set(),
      });
      for (const file of discriminatingFilesForTest(
        attempt.f,
        baselineTestDeltas,
        REPO_ROOT,
      )) {
        test.files.add(file);
      }
      for (const route of normalizeRoutes(attempt.routes, routeTable)) {
        test.routes.add(route);
        routes.add(route);
      }
    }
    specRoutes[spec] = [...routes].sort();
    specTests[spec] = Object.fromEntries(
      Object.entries(tests).map(([title, test]) => [
        title,
        { files: [...test.files].sort(), routes: [...test.routes].sort() },
      ]),
    );
    totalTests += Object.keys(tests).length;
  }

  // Carry over still-existing specs that didn't run today (failed/flaked shard).
  const prev = loadPrevManifests();
  let backfilled = 0;
  if (prev) {
    // Specs that still exist, so backfill never resurrects deleted ones.
    const current = new Set(listSpecFiles(REPO_ROOT));
    for (const [spec, files] of Object.entries(prev.specs)) {
      if (!(spec in specs) && current.has(spec)) {
        specs[spec] = files;
        specRoutes[spec] = prev.routes[spec] ?? [];
        specTests[spec] = prev.tests[spec] ?? {};
        totalFiles += files.length;
        totalTests += Object.keys(specTests[spec]).length;
        backfilled += 1;
      }
    }
  }

  const builtAt = builtAtSha();
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ builtAt, specs, routes: specRoutes }, null, 2) + "\n",
  );
  fs.writeFileSync(
    OUTPUT_TEST_FILE,
    JSON.stringify({ builtAt, specs: specTests }, null, 2) + "\n",
  );

  const specCount = Object.keys(specs).length;
  const bytes = fs.statSync(OUTPUT_FILE).size;
  const testBytes = fs.statSync(OUTPUT_TEST_FILE).size;
  console.log(
    `Wrote ${OUTPUT_FILE} (${specCount} specs, ${backfilled} backfilled, ` +
      `${totalFiles} file edges, ${(bytes / 1e6).toFixed(1)} MB, ` +
      `builtAt ${builtAt.slice(0, 12)}).`,
  );
  console.log(
    `Wrote ${OUTPUT_TEST_FILE} (${totalTests} tests, ` +
      `${(testBytes / 1e6).toFixed(1)} MB).`,
  );

  // Routes that didn't resolve to an OpenAPI-defined shape are worth eyes:
  // either an endpoint defined outside defendpoint or a capture bug.
  if (routeTable) {
    const allRoutes = new Set(Object.values(specRoutes).flat());
    const unmatched = [...allRoutes]
      .filter((route) => {
        const separator = route.indexOf(" ");
        const method = route.slice(0, separator);
        const pathname = route.slice(separator + 1);
        return matchRoute(routeTable, method, pathname) !== pathname;
      })
      .sort();
    console.log(
      `${allRoutes.size} distinct routes, ${unmatched.length} not in the ` +
        "OpenAPI table.",
    );
    // Backfilled specs can carry old-style routes for a day; cap the noise.
    const MAX_UNMATCHED_LISTED = 100;
    for (const route of unmatched.slice(0, MAX_UNMATCHED_LISTED)) {
      console.log(`  unmatched: ${route}`);
    }
    if (unmatched.length > MAX_UNMATCHED_LISTED) {
      console.log(`  ... and ${unmatched.length - MAX_UNMATCHED_LISTED} more`);
    }
  }
}

main();
