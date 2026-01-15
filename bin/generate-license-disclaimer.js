#!/usr/bin/env node

/**
 * Generates a license disclaimer file for all npm dependencies.
 * Uses bun pm licenses command. Ensure bun is installed for license generation.
 *
 * Usage: node bin/generate-license-disclaimer.js
 * Output: resources/license-frontend-third-party.txt
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

// ============== Pure Functions (tested) ==============

function normalizeRepoUrl(url) {
  if (!url) return null;
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

/**
 * Generate disclaimer text from bun licenses data.
 *
 * @param {object} licensesData - Raw output from `bun pm licenses --json`
 * @param {function} getLicenseInfo - Callback (pkg) => {licenseText, repoUrl} to resolve license info for each package
 * @returns {string} The disclaimer text
 */
function generateDisclaimerText(licensesData, getLicenseInfo) {
  // Flatten all packages from the grouped-by-license structure
  const allPackages = [];
  for (const [, packages] of Object.entries(licensesData)) {
    for (const pkg of packages) {
      // Handle packages with multiple versions
      for (let i = 0; i < pkg.paths.length; i++) {
        const version = pkg.versions[i] || pkg.versions[0];
        const pkgPath = pkg.paths[i];
        allPackages.push({
          name: pkg.name,
          version,
          path: pkgPath,
          homepage: pkg.homepage,
          description: pkg.description,
          author: pkg.author,
        });
      }
    }
  }

  // Enrich with license text and repo URL
  const packagesWithLicenses = allPackages.map(pkg => {
    const { licenseText, repoUrl } = getLicenseInfo(pkg);
    return {
      ...pkg,
      licenseText: licenseText || `License: See ${pkg.homepage || "package"}`,
      repoUrl,
    };
  });

  // Group packages by (normalized repo URL + license text)
  const groups = new Map();
  for (const pkg of packagesWithLicenses) {
    const normalizedRepo = normalizeRepoUrl(pkg.repoUrl);
    const key = `${normalizedRepo || pkg.name}|||${pkg.licenseText}`;

    if (!groups.has(key)) {
      groups.set(key, {
        packages: [],
        licenseText: pkg.licenseText,
        repoUrl: pkg.repoUrl,
      });
    }
    groups.get(key).packages.push(pkg);
  }

  // Sort groups alphabetically by first package name
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const aName = a.packages[0].name.toLowerCase();
    const bName = b.packages[0].name.toLowerCase();
    return aName.localeCompare(bName);
  });

  // Generate output
  const lines = [
    "THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES FOR THIRD PARTY SOFTWARE THAT MAY BE CONTAINED IN PORTIONS OF THE METABASE PRODUCT.",
    "",
  ];

  for (const group of sortedGroups) {
    // Sort packages within group by name
    group.packages.sort((a, b) => a.name.localeCompare(b.name));

    // Dedupe package names (multiple versions of same package)
    const uniqueNames = [...new Set(group.packages.map(p => p.name))];
    const packageList = uniqueNames.join(", ");

    // Build source URLs string
    let sourceInfo = "";
    if (group.repoUrl) {
      if (uniqueNames.length > 1) {
        // Multiple packages from same repo - list each with its URL
        const urlParts = uniqueNames.map(
          name => `${group.repoUrl} (${name})`,
        );
        sourceInfo = `A copy of the source code may be downloaded from ${urlParts.join(", ")}.`;
      } else {
        sourceInfo = `A copy of the source code may be downloaded from ${group.repoUrl}.`;
      }
    }

    lines.push("-----");
    lines.push("");
    lines.push(
      `The following software may be included in this product: ${packageList}.${sourceInfo ? " " + sourceInfo : ""} This software contains the following license and notice below:`,
    );
    lines.push("");
    lines.push(group.licenseText);
    lines.push("");
  }

  return lines.join("\n");
}

// ============== IO Functions (not tested) ==============

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
  return pkg.homepage || null;
}

// ============== Main ==============

if (require.main === module) {
  console.log("Fetching licenses from bun...");
  const licensesData = getLicensesJson();

  const output = generateDisclaimerText(licensesData, pkg => ({
    licenseText: findLicenseFile(pkg.path),
    repoUrl: getRepoUrl(pkg),
  }));

  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Generated ${OUTPUT_FILE}`);
}

module.exports = { generateDisclaimerText };
