/**
 * Pure functions for generating license disclaimer text.
 * No side effects - all I/O is handled by the caller.
 */

function normalizeRepoUrl(url) {
  if (!url) return null;
  // Remove git+ prefix and .git suffix for comparison
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

/**
 * Generate disclaimer text from pnpm licenses data.
 *
 * @param {object} licensesData - Raw output from `pnpm licenses list --json`
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

module.exports = { generateDisclaimerText };
