import fs from "node:fs";
import path from "node:path";

import { validateDataAppManifest } from "./validate-manifest";

jest.mock("node:fs");

const mockedFs = jest.mocked(fs);

const APP_ROOT = "/repo/data_apps/sales";
const YAML_PATH = path.join(APP_ROOT, "data_app.yaml");

const VALID_YAML = `
name: Sales dashboard
path: dist/index.js
`;

const setup = (files: Record<string, string | true>) => {
  mockedFs.existsSync.mockImplementation((p) => p.toString() in files);
  mockedFs.readFileSync.mockImplementation((p) => {
    const content = files[p.toString()];

    if (typeof content !== "string") {
      throw new Error(`unexpected read: ${p}`);
    }

    return content;
  });
};

afterEach(() => jest.resetAllMocks());

describe("validateDataAppManifest", () => {
  it("errors when the manifest is missing (the app would silently not sync)", () => {
    setup({});

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status.errors).toEqual([
      "No data_app.yaml found — this app will not sync.",
    ]);
  });

  it("accepts a valid manifest whose bundle exists", () => {
    setup({
      [YAML_PATH]: VALID_YAML,
      [path.join(APP_ROOT, "dist/index.js")]: true,
    });

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status).toMatchObject({
      name: "Sales dashboard",
      bundlePath: "dist/index.js",
      bundlePathExists: true,
      allowedHosts: [],
      errors: [],
      warnings: [],
      restartRequired: false,
    });
  });

  it("reports an unparseable yaml", () => {
    setup({ [YAML_PATH]: "name: [unclosed" });

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status.errors).toHaveLength(1);
    expect(status.errors[0]).toContain("Could not parse data_app.yaml");
  });

  it("warns when the bundle file does not exist yet", () => {
    setup({ [YAML_PATH]: VALID_YAML });

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status.errors).toEqual([]);
    expect(status.warnings).toEqual([
      '"dist/index.js" does not exist — run `npm run build` before committing, or sync will fail.',
    ]);
  });

  it("flags a restart when allowed_hosts drift from what the server booted with", () => {
    setup({
      [YAML_PATH]: `${VALID_YAML}allowed_hosts:\n  - https://api.example.com\n`,
      [path.join(APP_ROOT, "dist/index.js")]: true,
    });

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status.errors).toEqual([]);
    expect(status.restartRequired).toBe(true);
  });

  it("does not demand a restart for a padded or reordered allowed_hosts list", () => {
    // The startup list is the raw YAML; the validated list is normalized. Comparing
    // them naively reported a restart that restarting could never satisfy.
    setup({
      [YAML_PATH]: `
name: Sales dashboard
path: dist/index.js
allowed_hosts:
  - "  https://B.example.com  "
  - https://a.example.com
`,
    });

    const status = validateDataAppManifest(APP_ROOT, [
      "https://a.example.com",
      "  https://B.example.com  ",
    ]);

    expect(status.restartRequired).toBe(false);
  });

  it("accepts a non-string scalar the backend would stringify", () => {
    // `(some-> v str str/trim not-empty)` imports `name: 2024` as "2024".
    setup({
      [YAML_PATH]: `
name: 2024
path: dist/index.js
`,
    });

    const status = validateDataAppManifest(APP_ROOT, []);

    expect(status.name).toBe("2024");
    expect(status.errors).toEqual([]);
  });
});
