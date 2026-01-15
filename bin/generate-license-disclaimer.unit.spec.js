const { generateDisclaimerText } = require("./generate-license-disclaimer");

describe("generateDisclaimerText", () => {
  // Helper to create bun licenses data structure
  const makeLicensesData = packages => {
    // bun groups by license type, but we just need entries
    return {
      MIT: packages,
    };
  };

  // Simple mock that returns fixed values
  const mockGetLicenseInfo = licenseText => () => ({
    licenseText,
    repoUrl: "https://github.com/test/repo",
  });

  it("generates header", () => {
    const result = generateDisclaimerText({}, mockGetLicenseInfo("MIT"));
    expect(result).toMatch(
      /^THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES FOR THIRD PARTY SOFTWARE/,
    );
  });

  it("flattens packages from bun structure", () => {
    const licensesData = {
      MIT: [
        {
          name: "pkg-a",
          versions: ["1.0.0"],
          paths: ["/path/to/pkg-a"],
          homepage: "https://example.com",
        },
      ],
      Apache: [
        {
          name: "pkg-b",
          versions: ["2.0.0"],
          paths: ["/path/to/pkg-b"],
          homepage: "https://example.com",
        },
      ],
    };

    const result = generateDisclaimerText(
      licensesData,
      mockGetLicenseInfo("License"),
    );

    expect(result).toContain("pkg-a");
    expect(result).toContain("pkg-b");
  });

  it("handles packages with multiple versions", () => {
    const licensesData = makeLicensesData([
      {
        name: "multi-version",
        versions: ["1.0.0", "2.0.0"],
        paths: ["/path/v1", "/path/v2"],
        homepage: "https://example.com",
      },
    ]);

    const calls = [];
    const result = generateDisclaimerText(licensesData, pkg => {
      calls.push(pkg);
      return { licenseText: "MIT", repoUrl: null };
    });

    // Should have called getLicenseInfo for each version
    expect(calls.length).toBe(2);
    expect(calls[0].version).toBe("1.0.0");
    expect(calls[1].version).toBe("2.0.0");
  });

  it("generates entry for a single package", () => {
    const licensesData = makeLicensesData([
      {
        name: "test-package",
        versions: ["1.0.0"],
        paths: ["/path/to/test-package"],
        homepage: "https://test.com",
      },
    ]);

    const result = generateDisclaimerText(licensesData, () => ({
      licenseText: "MIT License text here",
      repoUrl: "https://github.com/test/test-package",
    }));

    expect(result).toContain("-----");
    expect(result).toContain(
      "The following software may be included in this product: test-package.",
    );
    expect(result).toContain(
      "A copy of the source code may be downloaded from https://github.com/test/test-package.",
    );
    expect(result).toContain("MIT License text here");
  });

  it("groups packages with same repo and license", () => {
    const licensesData = makeLicensesData([
      {
        name: "@scope/pkg-a",
        versions: ["1.0.0"],
        paths: ["/path/a"],
        homepage: null,
      },
      {
        name: "@scope/pkg-b",
        versions: ["1.0.0"],
        paths: ["/path/b"],
        homepage: null,
      },
    ]);

    const result = generateDisclaimerText(licensesData, () => ({
      licenseText: "MIT License",
      repoUrl: "https://github.com/scope/monorepo",
    }));

    // Should be grouped together
    expect(result).toContain("@scope/pkg-a, @scope/pkg-b");
    // License text should appear only once
    const licenseMatches = result.match(/MIT License/g);
    expect(licenseMatches.length).toBe(1);
  });

  it("does not group packages with different licenses", () => {
    const licensesData = makeLicensesData([
      {
        name: "pkg-a",
        versions: ["1.0.0"],
        paths: ["/path/a"],
        homepage: null,
      },
      {
        name: "pkg-b",
        versions: ["1.0.0"],
        paths: ["/path/b"],
        homepage: null,
      },
    ]);

    const result = generateDisclaimerText(licensesData, pkg => ({
      licenseText: pkg.name === "pkg-a" ? "MIT License" : "Apache License",
      repoUrl: "https://github.com/test/repo",
    }));

    // Should have separate entries
    expect(result).toContain(
      "The following software may be included in this product: pkg-a.",
    );
    expect(result).toContain(
      "The following software may be included in this product: pkg-b.",
    );
  });

  it("normalizes git URLs for grouping", () => {
    const licensesData = makeLicensesData([
      {
        name: "pkg-a",
        versions: ["1.0.0"],
        paths: ["/path/a"],
        homepage: null,
      },
      {
        name: "pkg-b",
        versions: ["1.0.0"],
        paths: ["/path/b"],
        homepage: null,
      },
    ]);

    const result = generateDisclaimerText(licensesData, pkg => ({
      licenseText: "MIT",
      repoUrl:
        pkg.name === "pkg-a"
          ? "git+https://github.com/test/repo.git"
          : "https://github.com/test/repo",
    }));

    // Should be grouped together despite different URL formats
    expect(result).toContain("pkg-a, pkg-b");
  });

  it("handles packages without repo URL", () => {
    const licensesData = makeLicensesData([
      {
        name: "no-repo-package",
        versions: ["1.0.0"],
        paths: ["/path"],
        homepage: null,
      },
    ]);

    const result = generateDisclaimerText(licensesData, () => ({
      licenseText: "Some License",
      repoUrl: null,
    }));

    expect(result).toContain(
      "The following software may be included in this product: no-repo-package. This software contains the following license",
    );
    expect(result).not.toContain("A copy of the source code may be downloaded");
  });

  it("uses fallback when no license text found", () => {
    const licensesData = makeLicensesData([
      {
        name: "no-license",
        versions: ["1.0.0"],
        paths: ["/path"],
        homepage: "https://example.com",
      },
    ]);

    const result = generateDisclaimerText(licensesData, () => ({
      licenseText: null,
      repoUrl: null,
    }));

    expect(result).toContain("License: See https://example.com");
  });

  it("sorts groups alphabetically", () => {
    const licensesData = makeLicensesData([
      { name: "zebra", versions: ["1.0.0"], paths: ["/z"], homepage: null },
      { name: "alpha", versions: ["1.0.0"], paths: ["/a"], homepage: null },
      { name: "middle", versions: ["1.0.0"], paths: ["/m"], homepage: null },
    ]);

    const result = generateDisclaimerText(licensesData, pkg => ({
      licenseText: `License for ${pkg.name}`,
      repoUrl: null,
    }));

    const alphaIndex = result.indexOf("alpha");
    const middleIndex = result.indexOf("middle");
    const zebraIndex = result.indexOf("zebra");

    expect(alphaIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(zebraIndex);
  });

  it("dedupes multiple versions of same package", () => {
    const licensesData = makeLicensesData([
      {
        name: "lodash",
        versions: ["4.0.0", "4.1.0"],
        paths: ["/path/v1", "/path/v2"],
        homepage: null,
      },
    ]);

    const result = generateDisclaimerText(licensesData, () => ({
      licenseText: "MIT",
      repoUrl: "https://github.com/lodash/lodash",
    }));

    // Should only list lodash once in the package list
    const matches = result.match(
      /The following software may be included in this product: lodash\./g,
    );
    expect(matches.length).toBe(1);
  });
});
