import { describe, expect, it } from "vitest";

import { version } from "../package.json";

import {
  generateIndexTsx,
  generateManifest,
  generatePackageJson,
} from "./templates";

describe("text templates", () => {
  it("generatePackageJson substitutes name and version", () => {
    const pkg = JSON.parse(generatePackageJson("my-custom-viz"));
    expect(pkg.name).toBe("my-custom-viz");
    expect(pkg.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("generateIndexTsx contains SDK import", () => {
    expect(generateIndexTsx("my-viz", "My Viz")).toContain(
      'from "@metabase/custom-viz"',
    );
  });

  it("generateIndexTsx substitutes id and display name separately", () => {
    const source = generateIndexTsx("my-viz", "My Viz");
    expect(source).toContain('id: "my-viz"');
    expect(source).toContain('getName: () => "My Viz"');
  });

  it("generateManifest substitutes name", () => {
    const manifest = JSON.parse(generateManifest("my-viz"));
    expect(manifest.name).toBe("my-viz");
  });
});
