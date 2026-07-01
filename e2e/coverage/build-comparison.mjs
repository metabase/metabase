// Compares per-spec hand-written manual.json against analyze-spec.mjs outputs.
//
// Reads e2e/coverage/analysis/<slug>/{manual.json,2-modules.json,3-modules-features.json}
// for every slug that has a manual.json, and writes:
//
//   e2e/coverage/analysis/comparison.json
//
// Each entry contains:
//   manual                  — features the analyst expects the spec to exercise
//   coverage-all            — every module the f-filter caught (incl. lib/basic/infra)
//   coverage-features       — coverage-all ∩ feature-set
//   manual-missing-in-cov   — manual modules NOT in coverage-features (concerning)
//   cov-extra-vs-manual     — coverage feature modules NOT in manual (analyst miss OR cross-feature use)
//
// Usage:
//   node e2e/coverage/build-comparison.mjs

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./file-to-module.mjs";

const ANALYSIS_DIR = path.join(REPO_ROOT, "e2e/coverage/analysis");
const OUTPUT_FILE = path.join(ANALYSIS_DIR, "comparison.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function diff(a, b) {
  const bSet = new Set(b);
  return a.filter((x) => !bSet.has(x));
}

function main() {
  const slugs = fs
    .readdirSync(ANALYSIS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => fs.existsSync(path.join(ANALYSIS_DIR, slug, "manual.json")))
    .sort();

  const comparison = {};
  for (const slug of slugs) {
    const dir = path.join(ANALYSIS_DIR, slug);
    const manual = readJson(path.join(dir, "manual.json")).features.sort();
    const coverageAll = readJson(path.join(dir, "2-modules.json"));
    const coverageFeatures = readJson(path.join(dir, "3-modules-features.json"));

    comparison[slug] = {
      manual,
      "coverage-all": coverageAll,
      "coverage-features": coverageFeatures,
      "manual-missing-in-cov": diff(manual, coverageFeatures),
      "cov-extra-vs-manual": diff(coverageFeatures, manual),
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(comparison, null, 2) + "\n");

  console.log(`Wrote ${OUTPUT_FILE}\n`);
  for (const [slug, c] of Object.entries(comparison)) {
    console.log(slug);
    console.log("  manual:                ", c.manual.join(", "));
    console.log("  coverage-features:     ", c["coverage-features"].join(", "));
    console.log(
      "  manual-missing-in-cov: ",
      c["manual-missing-in-cov"].join(", ") || "(none)",
    );
    console.log(
      "  cov-extra-vs-manual:   ",
      c["cov-extra-vs-manual"].join(", ") || "(none)",
    );
    console.log("");
  }
}

main();
