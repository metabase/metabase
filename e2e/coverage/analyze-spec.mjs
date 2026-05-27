// Per-spec analysis pipeline.
//
// Reads a raw __coverage__ file from e2e/coverage-manifest-raw/<slug>.json
// and emits the staged outputs that feed the comparison:
//
//   1-files.json            — files where the spec invoked at least one function
//                             MORE times than the baseline did (file-level greater-delta).
//                             A file where every function fired the same count in both
//                             is treated as "boot only" and dropped.
//   2-modules.json          — those files mapped to module identities
//   3-modules-features.json — modules filtered to the hand-curated "feature" set
//
// The baseline is the slug listed in BASELINE_SLUG below — currently the
// coverage-baseline spec that just signs in and visits /.
//
// Usage:
//   node e2e/coverage/analyze-spec.mjs <slug>
//   node e2e/coverage/analyze-spec.mjs --all   (process every raw file present)
//
// Slug example: e2e__test__scenarios__permissions__permissions-baseline.cy.spec.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fileToModule } from "./file-to-module.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const RAW_DIR = path.join(REPO_ROOT, "e2e/coverage-manifest-raw");
const ANALYSIS_DIR = path.join(REPO_ROOT, "e2e/coverage/analysis");
const FEATURE_SET_FILE = path.join(REPO_ROOT, "e2e/coverage/feature-modules.json");
const BASELINE_SLUG =
  "e2e__test__scenarios__coverage-baseline.cy.spec.js";

function loadFeatureSet() {
  const { features } = JSON.parse(fs.readFileSync(FEATURE_SET_FILE, "utf8"));
  return new Set(features);
}

function loadCoverage(slug) {
  const file = path.join(RAW_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  // Wrap was added when raw output moved into the prod path; accept both
  // shapes so local raw files collected before the change still analyze.
  return data.coverage ?? data;
}

// Spec touched the file "in addition" to baseline iff ANY function in the
// file has spec_count > baseline_count. A function that fired the same number
// of times in both is treated as boot-only and ignored.
function fileExceedsBaseline(specCov, baselineCov) {
  const sf = specCov.f || {};
  const bf = baselineCov?.f || {};
  for (const [idx, count] of Object.entries(sf)) {
    if (count > (bf[idx] || 0)) return true;
  }
  return false;
}

function analyzeOne(slug, featureSet, baselineCov) {
  const cov = loadCoverage(slug);
  if (!cov) {
    console.error(`No raw coverage for ${slug}`);
    return;
  }

  // Stage 1: files where at least one function fired more times in this spec
  // than in baseline (file-level greater-delta).
  const files = Object.entries(cov)
    .filter(([file, fc]) => fileExceedsBaseline(fc, baselineCov[file]))
    .map(([file]) => path.relative(REPO_ROOT, file))
    .sort();

  // Stage 2: distinct modules those files belong to.
  const modules = new Set();
  for (const file of files) {
    const m = fileToModule(file);
    if (m) modules.add(m);
  }
  const modulesSorted = [...modules].sort();

  // Stage 3: modules ∩ feature set.
  const featureModules = modulesSorted.filter((m) => featureSet.has(m));

  const outDir = path.join(ANALYSIS_DIR, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "1-files.json"),
    JSON.stringify(files, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(outDir, "2-modules.json"),
    JSON.stringify(modulesSorted, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(outDir, "3-modules-features.json"),
    JSON.stringify(featureModules, null, 2) + "\n",
  );

  console.log(
    `${slug}\n  files: ${files.length}\n  modules: ${modulesSorted.length}\n  feature modules: ${featureModules.length}`,
  );
}

function main() {
  const featureSet = loadFeatureSet();
  const baselineCov = loadCoverage(BASELINE_SLUG);
  if (!baselineCov) {
    console.error(
      `Baseline raw coverage missing at ${BASELINE_SLUG}. Run the baseline spec first.`,
    );
    process.exit(1);
  }
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node analyze-spec.mjs <slug>|--all");
    process.exit(1);
  }
  const slugs =
    arg === "--all"
      ? fs
          .readdirSync(RAW_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.slice(0, -".json".length))
          .filter((slug) => slug !== BASELINE_SLUG)
      : [arg];
  for (const slug of slugs) {
    analyzeOne(slug, featureSet, baselineCov);
  }
}

main();
