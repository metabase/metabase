import fs from "node:fs";
import path from "node:path";

import { readAppSlug, readManifest } from "./read-manifest";

jest.mock("node:fs");

const mockedFs = jest.mocked(fs);

const APP_ROOT = "/app";
const YAML_PATH = path.join(APP_ROOT, "data_app.yaml");
const YML_PATH = path.join(APP_ROOT, "data_app.yml");

const setup = (files: Record<string, string>) => {
  mockedFs.existsSync.mockImplementation((p) => p.toString() in files);
  mockedFs.readFileSync.mockImplementation((p) => {
    const content = files[p.toString()];

    if (content == null) {
      throw new Error(`unexpected read: ${p}`);
    }

    return content;
  });
};

afterEach(() => jest.resetAllMocks());

describe("readManifest", () => {
  it("returns null when no manifest exists", () => {
    setup({});

    expect(readManifest(APP_ROOT)).toBeNull();
  });

  it("prefers data_app.yaml over data_app.yml", () => {
    setup({ [YAML_PATH]: "slug: yaml-app\n", [YML_PATH]: "slug: yml-app\n" });

    expect(readManifest(APP_ROOT)).toEqual({
      manifestPath: YAML_PATH,
      manifest: { slug: "yaml-app" },
    });
  });

  it("returns an empty manifest for non-object yaml", () => {
    setup({ [YML_PATH]: "just a string\n" });

    expect(readManifest(APP_ROOT)?.manifest).toEqual({});
  });

  it("throws on unparseable yaml", () => {
    setup({ [YML_PATH]: "slug: [unclosed\n" });

    expect(() => readManifest(APP_ROOT)).toThrow(/Could not parse/);
  });
});

describe("readAppSlug", () => {
  it("reads the slug from the manifest", () => {
    setup({ [YML_PATH]: "name: Sales dashboard\nslug: sales\n" });

    expect(readAppSlug(APP_ROOT)).toBe("sales");
  });

  it("trims the slug", () => {
    setup({ [YML_PATH]: "slug: ' sales '\n" });

    expect(readAppSlug(APP_ROOT)).toBe("sales");
  });

  it("returns '' when the manifest is missing", () => {
    setup({});

    expect(readAppSlug(APP_ROOT)).toBe("");
  });

  it("returns '' when the slug is absent or not a string", () => {
    setup({ [YML_PATH]: "name: Sales dashboard\n" });
    expect(readAppSlug(APP_ROOT)).toBe("");

    setup({ [YML_PATH]: "slug: 123\n" });
    expect(readAppSlug(APP_ROOT)).toBe("");
  });
});
