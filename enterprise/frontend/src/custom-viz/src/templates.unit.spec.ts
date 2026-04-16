import { describe, expect, it } from "vitest";

import { version } from "../package.json";

import {
  generateIndexTsx,
  generateManifest,
  generatePackageJson,
  generatePackageLockJson,
  generateUpgradePackageJson,
} from "./templates";

describe("text templates", () => {
  it("generatePackageJson substitutes name and version", () => {
    const pkg = JSON.parse(generatePackageJson("my-custom-viz"));
    expect(pkg.name).toBe("my-custom-viz");
    expect(pkg.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("generatePackageLockJson substitutes name", () => {
    const lock = JSON.parse(generatePackageLockJson("my-viz"));
    expect(lock.name).toBe("my-viz");
  });

  it("generateIndexTsx contains SDK import", () => {
    expect(generateIndexTsx("my-viz")).toContain("@metabase/custom-viz");
  });

  it("generateManifest substitutes name", () => {
    const manifest = JSON.parse(generateManifest("my-viz"));
    expect(manifest.name).toBe("my-viz");
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

  it("preserves user fields and upgrades SDK version", () => {
    const result = JSON.parse(generateUpgradePackageJson(existingPkg));
    expect(result.name).toBe("my-viz");
    expect(result.version).toBe("1.0.0");
    expect(result.devDependencies["@metabase/custom-viz"]).toBe(version);
    expect(result.devDependencies["my-dep"]).toBe("^1.0.0");
    expect(result.scripts["my-script"]).toBe("echo hello");
  });

  it("preserves extra top-level fields", () => {
    const withExtra = JSON.stringify({
      ...JSON.parse(existingPkg),
      description: "My custom viz",
    });
    const result = JSON.parse(generateUpgradePackageJson(withExtra));
    expect(result.description).toBe("My custom viz");
  });
});
