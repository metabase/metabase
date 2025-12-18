#!/usr/bin/env node

/**
 * Generates a license disclaimer file for all npm dependencies.
 * Note: Uses bun pm licenses command. Ensure bun is installed for license generation.
 *
 * Usage: node bin/generate-license-disclaimer.js
 * Output: resources/license-frontend-third-party.txt
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { generateDisclaimerText } = require("./generate-license-disclaimer-lib");

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "resources",
  "license-frontend-third-party.txt",
);

const LICENSE_FILE_NAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "license",
  "license.md",
  "license.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
];

function getLicensesJson() {
  const output = execSync("bun pm licenses --json", {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function findLicenseFile(packagePath) {
  for (const name of LICENSE_FILE_NAMES) {
    const licensePath = path.join(packagePath, name);
    if (fs.existsSync(licensePath)) {
      return fs.readFileSync(licensePath, "utf-8").trim();
    }
  }
  return null;
}

function getRepoUrl(pkg) {
  // Try to get repository URL from package.json
  const pkgJsonPath = path.join(pkg.path, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkgJson.repository) {
        if (typeof pkgJson.repository === "string") {
          return pkgJson.repository;
        }
        if (pkgJson.repository.url) {
          return pkgJson.repository.url;
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  // Fall back to homepage
  return pkg.homepage || null;
}

console.log("Fetching licenses from bun...");
const licensesData = getLicensesJson();

const output = generateDisclaimerText(licensesData, pkg => ({
  licenseText: findLicenseFile(pkg.path),
  repoUrl: getRepoUrl(pkg),
}));

fs.writeFileSync(OUTPUT_FILE, output);
console.log(`Generated ${OUTPUT_FILE}`);
