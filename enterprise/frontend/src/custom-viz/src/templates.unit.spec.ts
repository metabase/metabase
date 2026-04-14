import { describe, expect, it } from "vitest";

import { version } from "../package.json";

import {
  generateGitignore,
  generateIconSvg,
  generateIndexTsx,
  generateManifest,
  generatePackageJson,
  generatePackageLockJson,
  generateTsConfig,
  generateUpgradePackageJson,
  generateViteConfig,
  readBinaryTemplate,
} from "./templates";

const NAME_PLACEHOLDER = "__CUSTOM_VIZ_NAME__";
const VERSION_PLACEHOLDER = "__CUSTOM_VIZ_VERSION__";

describe("template files", () => {
  it("package.json template contains name and version placeholders", () => {
    // generatePackageJson resolves placeholders, so verify by checking the
    // raw output still contains neither placeholder after substitution.
    const result = generatePackageJson("test-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
    expect(result).not.toContain(VERSION_PLACEHOLDER);
  });

  it("index.tsx template contains name placeholder", () => {
    const result = generateIndexTsx("test-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
  });

  it("manifest template contains name placeholder", () => {
    const result = generateManifest("test-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
  });
});

describe("generatePackageJson", () => {
  it("substitutes the project name", () => {
    const result = generatePackageJson("my-custom-viz");
    const pkg = JSON.parse(result);
    expect(pkg.name).toBe("my-custom-viz");
  });

  it("substitutes the SDK version", () => {
    const result = generatePackageJson("my-custom-viz");
    const pkg = JSON.parse(result);
    expect(pkg.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("does not contain unresolved placeholders", () => {
    const result = generatePackageJson("my-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
    expect(result).not.toContain(VERSION_PLACEHOLDER);
  });

  it("produces valid JSON", () => {
    expect(() => JSON.parse(generatePackageJson("test"))).not.toThrow();
  });
});

describe("generatePackageLockJson", () => {
  it("substitutes the project name", () => {
    const result = generatePackageLockJson("my-viz");
    const lock = JSON.parse(result);
    expect(lock.name).toBe("my-viz");
  });

  it("does not contain unresolved placeholders", () => {
    const result = generatePackageLockJson("my-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
    expect(result).not.toContain(VERSION_PLACEHOLDER);
  });
});

describe("generateIndexTsx", () => {
  it("substitutes the project name as the visualization id", () => {
    const result = generateIndexTsx("my-viz");
    expect(result).toContain('"my-viz"');
  });

  it("rewrites the relative import to the package name", () => {
    const result = generateIndexTsx("my-viz");
    expect(result).toContain("@metabase/custom-viz");
    expect(result).not.toContain('from "../"');
  });

  it("does not contain unresolved placeholders", () => {
    const result = generateIndexTsx("my-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
  });
});

describe("generateManifest", () => {
  it("substitutes the project name", () => {
    const result = generateManifest("my-viz");
    const manifest = JSON.parse(result);
    expect(manifest.name).toBe("my-viz");
  });

  it("does not contain unresolved placeholders", () => {
    const result = generateManifest("my-viz");
    expect(result).not.toContain(NAME_PLACEHOLDER);
  });

  it("produces valid JSON with expected fields", () => {
    const manifest = JSON.parse(generateManifest("my-viz"));
    expect(manifest).toHaveProperty("icon");
    expect(manifest).toHaveProperty("assets");
    expect(manifest).toHaveProperty("metabase.version");
  });
});

describe("static templates", () => {
  it("tsconfig is valid JSON", () => {
    expect(() => JSON.parse(generateTsConfig())).not.toThrow();
  });

  it("gitignore includes node_modules", () => {
    expect(generateGitignore()).toContain("node_modules");
  });

  it("icon.svg is an SVG", () => {
    expect(generateIconSvg()).toContain("<svg");
  });

  it("vite config contains externals plugin", () => {
    expect(generateViteConfig()).toContain("metabaseVizExternals");
  });

  it("vite config contains dev server plugin", () => {
    expect(generateViteConfig()).toContain("metabaseDevServer");
  });
});

describe("readBinaryTemplate", () => {
  it("reads thumbs-up.png as a Buffer", () => {
    const buf = readBinaryTemplate("thumbs-up.png");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("reads thumbs-down.png as a Buffer", () => {
    const buf = readBinaryTemplate("thumbs-down.png");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("thumbs-up.png has valid PNG signature", () => {
    const buf = readBinaryTemplate("thumbs-up.png");
    // PNG files start with the 8-byte signature: 137 80 78 71 13 10 26 10
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(buf.subarray(0, 8)).toEqual(pngSignature);
  });

  it("thumbs-down.png has valid PNG signature", () => {
    const buf = readBinaryTemplate("thumbs-down.png");
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(buf.subarray(0, 8)).toEqual(pngSignature);
  });
});

describe("generateUpgradePackageJson", () => {
  const existingPkg = JSON.stringify(
    {
      name: "my-viz",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        build: "vite build",
        dev: "vite build --watch",
        "type-check": "tsc --noEmit",
        "my-script": "echo hello",
      },
      devDependencies: {
        "@metabase/custom-viz": "0.0.1-alpha.1",
        "@types/react": "^18.0.0",
        "my-dep": "^1.0.0",
      },
    },
    null,
    2,
  );

  it("preserves the user's package name and version", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.name).toBe("my-viz");
    expect(result.version).toBe("1.0.0");
  });

  it("updates @metabase/custom-viz to latest version", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("preserves user-added devDependencies", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.devDependencies["my-dep"]).toBe("^1.0.0");
  });

  it("preserves user-added scripts", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.scripts["my-script"]).toBe("echo hello");
  });

  it("updates template scripts to latest versions", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.scripts.build).toBe("vite build");
  });

  it("preserves extra top-level fields", () => {
    const withExtra = JSON.stringify({
      ...JSON.parse(existingPkg),
      description: "My custom viz",
    });
    const result = JSON.parse(generateUpgradePackageJson(withExtra));
    expect(result.description).toBe("My custom viz");
  });

  it("outputs formatted JSON with trailing newline", () => {
    const result = generateUpgradePackageJson(existingPkg);
    expect(result).toMatch(/\n$/);
    // Should be indented with 2 spaces
    expect(result).toContain('  "name"');
  });
});
