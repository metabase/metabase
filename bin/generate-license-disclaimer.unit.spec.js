const {
  generateDisclaimerText,
  parseBunFolderName,
  scanBunPackages,
} = require("./generate-license-disclaimer");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("parseBunFolderName", () => {
  it("parses simple package names", () => {
    expect(parseBunFolderName("lodash@4.17.21")).toEqual({
      name: "lodash",
      version: "4.17.21",
    });
  });

  it("parses scoped package names", () => {
    expect(parseBunFolderName("@babel+core@7.28.4")).toEqual({
      name: "@babel/core",
      version: "7.28.4",
    });
  });

  it("parses deeply scoped package names", () => {
    expect(parseBunFolderName("@emotion+react@11.11.0")).toEqual({
      name: "@emotion/react",
      version: "11.11.0",
    });
  });

  it("returns undefined for invalid names", () => {
    expect(parseBunFolderName("invalid")).toBeUndefined();
    expect(parseBunFolderName("")).toBeUndefined();
  });
});

describe("scanBunPackages", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bun-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it("scans packages from .bun directory", () => {
    const pkgDir = path.join(
      tempDir,
      "lodash@4.17.21",
      "node_modules",
      "lodash",
    );
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "package.json"), "{}");

    const packages = scanBunPackages(tempDir);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("lodash");
    expect(packages[0].version).toBe("4.17.21");
  });

  it("scans scoped packages", () => {
    const pkgDir = path.join(
      tempDir,
      "@babel+core@7.28.4",
      "node_modules",
      "@babel/core",
    );
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "package.json"), "{}");

    const packages = scanBunPackages(tempDir);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("@babel/core");
    expect(packages[0].version).toBe("7.28.4");
  });

  it("skips folders that don't match expected structure", () => {
    fs.mkdirSync(path.join(tempDir, "invalid-folder"));
    fs.mkdirSync(path.join(tempDir, "also-invalid@1.0.0"));

    const packages = scanBunPackages(tempDir);

    expect(packages).toHaveLength(0);
  });

  it("throws if directory doesn't exist", () => {
    expect(() => scanBunPackages("/nonexistent")).toThrow();
  });
});

describe("generateDisclaimerText", () => {
  const mockGetPackageDetails = (licenseText, repoUrl) => () => ({
    licenseText,
    repoUrl,
    homepage: "https://example.com",
  });

  it("generates header", () => {
    const result = generateDisclaimerText(
      [],
      mockGetPackageDetails("MIT", null),
    );
    expect(result).toMatch(
      /^THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES FOR THIRD PARTY SOFTWARE/,
    );
  });

  it("generates entry for a single package", () => {
    const packages = [
      { name: "test-package", version: "1.0.0", path: "/path" },
    ];

    const result = generateDisclaimerText(packages, () => ({
      licenseText: "MIT License text here",
      repoUrl: "https://github.com/test/test-package",
      homepage: null,
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
    const packages = [
      { name: "@scope/pkg-a", version: "1.0.0", path: "/path/a" },
      { name: "@scope/pkg-b", version: "1.0.0", path: "/path/b" },
    ];

    const result = generateDisclaimerText(packages, () => ({
      licenseText: "MIT License",
      repoUrl: "https://github.com/scope/monorepo",
      homepage: null,
    }));

    expect(result).toContain("@scope/pkg-a, @scope/pkg-b");
    const licenseMatches = result.match(/MIT License/g);
    expect(licenseMatches.length).toBe(1);
  });

  it("does not group packages with different licenses", () => {
    const packages = [
      { name: "pkg-a", version: "1.0.0", path: "/path/a" },
      { name: "pkg-b", version: "1.0.0", path: "/path/b" },
    ];

    const result = generateDisclaimerText(packages, (pkg) => ({
      licenseText: pkg.name === "pkg-a" ? "MIT License" : "Apache License",
      repoUrl: "https://github.com/test/repo",
      homepage: null,
    }));

    expect(result).toContain(
      "The following software may be included in this product: pkg-a.",
    );
    expect(result).toContain(
      "The following software may be included in this product: pkg-b.",
    );
  });

  it("normalizes git URLs for grouping", () => {
    const packages = [
      { name: "pkg-a", version: "1.0.0", path: "/path/a" },
      { name: "pkg-b", version: "1.0.0", path: "/path/b" },
    ];

    const result = generateDisclaimerText(packages, (pkg) => ({
      licenseText: "MIT",
      repoUrl:
        pkg.name === "pkg-a"
          ? "git+https://github.com/test/repo.git"
          : "https://github.com/test/repo",
      homepage: null,
    }));

    expect(result).toContain("pkg-a, pkg-b");
  });

  it("handles packages without repo URL", () => {
    const packages = [
      { name: "no-repo-package", version: "1.0.0", path: "/path" },
    ];

    const result = generateDisclaimerText(packages, () => ({
      licenseText: "Some License",
      repoUrl: null,
      homepage: null,
    }));

    expect(result).toContain(
      "The following software may be included in this product: no-repo-package. This software contains the following license",
    );
    expect(result).not.toContain("A copy of the source code may be downloaded");
  });

  it("uses fallback when no license text found", () => {
    const packages = [{ name: "no-license", version: "1.0.0", path: "/path" }];

    const result = generateDisclaimerText(packages, () => ({
      licenseText: null,
      repoUrl: null,
      homepage: "https://example.com",
    }));

    expect(result).toContain("License: See https://example.com package");
  });

  it("sorts groups alphabetically", () => {
    const packages = [
      { name: "zebra", version: "1.0.0", path: "/z" },
      { name: "alpha", version: "1.0.0", path: "/a" },
      { name: "middle", version: "1.0.0", path: "/m" },
    ];

    const result = generateDisclaimerText(packages, (pkg) => ({
      licenseText: `License for ${pkg.name}`,
      repoUrl: null,
      homepage: null,
    }));

    const alphaIndex = result.indexOf("alpha");
    const middleIndex = result.indexOf("middle");
    const zebraIndex = result.indexOf("zebra");

    expect(alphaIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(zebraIndex);
  });

  it("dedupes multiple versions of same package", () => {
    const packages = [
      { name: "lodash", version: "4.0.0", path: "/path/v1" },
      { name: "lodash", version: "4.1.0", path: "/path/v2" },
    ];

    const result = generateDisclaimerText(packages, () => ({
      licenseText: "MIT",
      repoUrl: "https://github.com/lodash/lodash",
      homepage: null,
    }));

    const matches = result.match(
      /The following software may be included in this product: lodash\./g,
    );
    expect(matches.length).toBe(1);
  });
});

describe("integration", () => {
  it("runs successfully and generates valid output", () => {
    const { execFileSync } = require("child_process");
    const scriptPath = path.join(__dirname, "generate-license-disclaimer.js");
    const outputFile = path.join(
      __dirname,
      "..",
      "resources",
      "license-frontend-third-party.txt",
    );

    const result = execFileSync("node", [scriptPath], { encoding: "utf-8" });

    expect(result).toMatch(/Found \d+ packages/);

    const packageCount = parseInt(result.match(/Found (\d+) packages/)[1], 10);
    expect(packageCount).toBeGreaterThan(1000);

    const content = fs.readFileSync(outputFile, "utf-8");
    expect(content).toMatch(/^THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES/);
    expect(content).toContain("-----");
    expect(content).toContain("This software contains the following license");
  });
});
