#!/usr/bin/env node

// Usage: node bin/generate-license-disclaimer.js [output-path]
// If output-path is not provided, writes to resources/license-frontend-third-party.txt

const fs = require("fs");
const path = require("path");

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "resources",
  "license-frontend-third-party.txt",
);

const BUN_MODULES_DIR = path.join(__dirname, "..", "node_modules", ".bun");

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

function normalizeRepoUrl(url) {
  if (!url) {
    return undefined;
  }
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

/**
 * Parse a bun package folder name like "@scope+pkg@1.0.0" or "lodash@4.17.21"
 * Returns { name, version } or undefined if invalid.
 */
function parseBunFolderName(folderName) {
  const lastAtIndex = folderName.lastIndexOf("@");
  if (lastAtIndex <= 0) {
    return undefined;
  }
  const name = folderName.slice(0, lastAtIndex).replace(/\+/g, "/");
  const version = folderName.slice(lastAtIndex + 1);
  return { name, version };
}

/**
 * Scan node_modules/.bun/ and return array of packages with their paths.
 */
function scanBunPackages(bunModulesDir) {
  if (!fs.existsSync(bunModulesDir)) {
    throw new Error(`Bun modules directory not found: ${bunModulesDir}`);
  }

  const folders = fs.readdirSync(bunModulesDir);
  const packages = [];

  for (const folder of folders) {
    const parsed = parseBunFolderName(folder);
    if (!parsed) {
      continue;
    }

    const packagePath = path.join(
      bunModulesDir,
      folder,
      "node_modules",
      parsed.name,
    );

    if (!fs.existsSync(packagePath)) {
      continue;
    }

    packages.push({
      name: parsed.name,
      version: parsed.version,
      path: packagePath,
    });
  }

  return packages;
}

function findLicenseFile(packagePath) {
  for (const name of LICENSE_FILE_NAMES) {
    const licensePath = path.join(packagePath, name);
    if (fs.existsSync(licensePath)) {
      return fs.readFileSync(licensePath, "utf-8").trim();
    }
  }
  return undefined;
}

function getPackageInfo(packagePath) {
  const pkgJsonPath = path.join(packagePath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * Generate disclaimer text from package list.
 *
 * @param {Array} packages - Array of {name, version, path}
 * @param {function} getPackageDetails - Callback (pkg) => {licenseText, repoUrl, homepage}
 * @returns {string} The disclaimer text
 */
function generateDisclaimerText(packages, getPackageDetails) {
  const enriched = packages.map((pkg) => {
    const details = getPackageDetails(pkg);
    return {
      ...pkg,
      licenseText:
        details.licenseText ||
        `License: See ${details.homepage || pkg.name} package`,
      repoUrl: details.repoUrl,
    };
  });

  const groups = new Map();
  for (const pkg of enriched) {
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

  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const aName = a.packages[0].name.toLowerCase();
    const bName = b.packages[0].name.toLowerCase();
    return aName.localeCompare(bName);
  });

  const lines = [
    "THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES FOR THIRD PARTY SOFTWARE THAT MAY BE CONTAINED IN PORTIONS OF THE METABASE PRODUCT.",
    "",
  ];

  for (const group of sortedGroups) {
    group.packages.sort((a, b) => a.name.localeCompare(b.name));
    const uniqueNames = [...new Set(group.packages.map((p) => p.name))];
    const packageList = uniqueNames.join(", ");

    let sourceInfo = "";
    if (group.repoUrl) {
      if (uniqueNames.length > 1) {
        const urlParts = uniqueNames.map(
          (name) => `${group.repoUrl} (${name})`,
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

if (require.main === module) {
  // Allow overriding output path via command line argument (useful for tests)
  const outputPath = process.argv[2] || OUTPUT_FILE;

  console.log("Scanning bun packages...");
  const packages = scanBunPackages(BUN_MODULES_DIR);
  console.log(`Found ${packages.length} packages`);

  const output = generateDisclaimerText(packages, (pkg) => {
    const pkgJson = getPackageInfo(pkg.path) || {};
    const licenseFile = findLicenseFile(pkg.path);
    // Fall back to license field from package.json if no LICENSE file found
    const licenseText = licenseFile || pkgJson.license || undefined;

    const repo = pkgJson.repository;
    const repoUrl =
      (typeof repo === "string" ? repo : repo?.url) ||
      pkgJson.homepage ||
      undefined;
    return {
      licenseText,
      repoUrl: repoUrl,
      homepage: pkgJson.homepage,
    };
  });

  fs.writeFileSync(outputPath, output);
  console.log(`Generated ${outputPath}`);
}

module.exports = {
  generateDisclaimerText,
  parseBunFolderName,
  scanBunPackages,
};
