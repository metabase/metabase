/**
 * Tests for the template generation logic in templates.ts.
 *
 * templates.ts uses `import.meta.url` (for readBinaryTemplate) and Vite `?raw`
 * imports, both of which are unavailable in Jest's CJS environment. Rather than
 * fighting the module system, we read the raw template files from disk and
 * verify the same substitution logic that templates.ts applies.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { version } from "../package.json";

const TEMPLATES_DIR = join(__dirname, "templates");
const NAME_PLACEHOLDER = "__CUSTOM_VIZ_NAME__";
const VERSION_PLACEHOLDER = "__CUSTOM_VIZ_VERSION__";

// Read templates the same way the build output would — as raw strings.
const packageJsonTemplate = readFileSync(
  join(TEMPLATES_DIR, "package.json"),
  "utf-8",
);
const packageLockJsonTemplate = readFileSync(
  join(TEMPLATES_DIR, "package-lock.json"),
  "utf-8",
);
const indexTsxTemplate = readFileSync(
  join(TEMPLATES_DIR, "index.tsx"),
  "utf-8",
);
const manifestTemplate = readFileSync(
  join(TEMPLATES_DIR, "metabase-plugin.json"),
  "utf-8",
);
const tsconfigTemplate = readFileSync(
  join(TEMPLATES_DIR, "tsconfig.json"),
  "utf-8",
);
const gitignoreTemplate = readFileSync(
  join(TEMPLATES_DIR, ".gitignore"),
  "utf-8",
);
const iconSvgTemplate = readFileSync(join(TEMPLATES_DIR, "icon.svg"), "utf-8");

// These mirror the helper functions in templates.ts
function replaceName(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name);
}

function replaceImportPath(template: string): string {
  return template.replace("../", "@metabase/custom-viz");
}

function generatePackageJson(name: string): string {
  return replaceName(packageJsonTemplate, name)
    .split(VERSION_PLACEHOLDER)
    .join(version);
}

function generatePackageLockJson(name: string): string {
  return replaceName(packageLockJsonTemplate, name)
    .split(VERSION_PLACEHOLDER)
    .join(version);
}

function generateIndexTsx(name: string): string {
  return replaceName(replaceImportPath(indexTsxTemplate), name);
}

function generateManifest(name: string): string {
  return replaceName(manifestTemplate, name);
}

function generateUpgradePackageJson(existingJson: string): string {
  const existing = JSON.parse(existingJson);
  const template = JSON.parse(
    packageJsonTemplate
      .split(NAME_PLACEHOLDER)
      .join("__placeholder__")
      .split(VERSION_PLACEHOLDER)
      .join(version),
  );

  existing.devDependencies = {
    ...existing.devDependencies,
    ...template.devDependencies,
  };

  existing.scripts = {
    ...existing.scripts,
    ...template.scripts,
  };

  return JSON.stringify(existing, null, 2) + "\n";
}

// ---- Sanity checks that the templates contain expected placeholders ----

describe("template files", () => {
  it("package.json template contains name and version placeholders", () => {
    expect(packageJsonTemplate).toContain(NAME_PLACEHOLDER);
    expect(packageJsonTemplate).toContain(VERSION_PLACEHOLDER);
  });

  it("index.tsx template contains name placeholder", () => {
    expect(indexTsxTemplate).toContain(NAME_PLACEHOLDER);
  });

  it("manifest template contains name placeholder", () => {
    expect(manifestTemplate).toContain(NAME_PLACEHOLDER);
  });
});

// ---- Template generation logic ----

describe("generatePackageJson", () => {
  it("substitutes the project name", () => {
    const parsed = JSON.parse(generatePackageJson("my-cool-viz"));
    expect(parsed.name).toBe("my-cool-viz");
  });

  it("substitutes the SDK version", () => {
    const parsed = JSON.parse(generatePackageJson("test-viz"));
    expect(parsed.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("does not contain unresolved placeholders", () => {
    const result = generatePackageJson("test-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
    expect(result).not.toContain(VERSION_PLACEHOLDER);
  });

  it("produces valid JSON", () => {
    expect(() => JSON.parse(generatePackageJson("test"))).not.toThrow();
  });
});

describe("generatePackageLockJson", () => {
  it("substitutes the project name", () => {
    const parsed = JSON.parse(generatePackageLockJson("my-lock-viz"));
    expect(parsed.name).toBe("my-lock-viz");
  });

  it("does not contain unresolved placeholders", () => {
    const result = generatePackageLockJson("test-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
    expect(result).not.toContain(VERSION_PLACEHOLDER);
  });
});

describe("generateIndexTsx", () => {
  it("substitutes the project name as the visualization id", () => {
    expect(generateIndexTsx("bar-chart-viz")).toContain("bar-chart-viz");
  });

  it("rewrites the relative import to the package name", () => {
    const result = generateIndexTsx("test-viz");
    expect(result).toContain("@metabase/custom-viz");
    expect(result).not.toContain('from "../"');
  });

  it("does not contain unresolved placeholders", () => {
    expect(generateIndexTsx("test-viz")).not.toContain(NAME_PLACEHOLDER);
  });
});

describe("generateManifest", () => {
  it("substitutes the project name", () => {
    const parsed = JSON.parse(generateManifest("pie-chart"));
    expect(parsed.name).toBe("pie-chart");
  });

  it("does not contain unresolved placeholders", () => {
    expect(generateManifest("test")).not.toContain(NAME_PLACEHOLDER);
  });

  it("produces valid JSON with expected fields", () => {
    const parsed = JSON.parse(generateManifest("test"));
    expect(parsed).toHaveProperty("icon");
    expect(parsed).toHaveProperty("metabase");
  });
});

describe("static templates", () => {
  it("tsconfig is valid JSON", () => {
    expect(() => JSON.parse(tsconfigTemplate)).not.toThrow();
  });

  it("gitignore includes node_modules", () => {
    expect(gitignoreTemplate).toContain("node_modules");
  });

  it("icon.svg is an SVG", () => {
    expect(iconSvgTemplate).toContain("<svg");
  });
});

describe("generateUpgradePackageJson", () => {
  const makeExistingPkg = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: "user-viz",
      version: "1.0.0",
      scripts: {
        dev: "vite build --watch",
        "my-script": "echo hello",
      },
      devDependencies: {
        "@metabase/custom-viz": "0.0.1-alpha.1",
        "user-dep": "^1.0.0",
      },
      ...overrides,
    });

  it("preserves the user's package name and version", () => {
    const result = JSON.parse(generateUpgradePackageJson(makeExistingPkg()));
    expect(result.name).toBe("user-viz");
    expect(result.version).toBe("1.0.0");
  });

  it("updates @metabase/custom-viz to latest version", () => {
    const result = JSON.parse(generateUpgradePackageJson(makeExistingPkg()));
    expect(result.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("preserves user-added devDependencies", () => {
    const result = JSON.parse(generateUpgradePackageJson(makeExistingPkg()));
    expect(result.devDependencies["user-dep"]).toBe("^1.0.0");
  });

  it("preserves user-added scripts", () => {
    const result = JSON.parse(generateUpgradePackageJson(makeExistingPkg()));
    expect(result.scripts["my-script"]).toBe("echo hello");
  });

  it("updates template scripts to latest versions", () => {
    const result = JSON.parse(
      generateUpgradePackageJson(
        makeExistingPkg({
          scripts: { build: "old-build-cmd", dev: "old-dev-cmd" },
        }),
      ),
    );
    const templatePkg = JSON.parse(generatePackageJson("__placeholder__"));
    expect(result.scripts.build).toBe(templatePkg.scripts.build);
    expect(result.scripts.dev).toBe(templatePkg.scripts.dev);
  });

  it("preserves extra top-level fields", () => {
    const result = JSON.parse(
      generateUpgradePackageJson(
        makeExistingPkg({ description: "My custom viz" }),
      ),
    );
    expect(result.description).toBe("My custom viz");
  });

  it("outputs formatted JSON with trailing newline", () => {
    const result = generateUpgradePackageJson(makeExistingPkg());
    expect(result).toMatch(/\n$/);
    expect(result).toContain('  "name"');
  });
});
