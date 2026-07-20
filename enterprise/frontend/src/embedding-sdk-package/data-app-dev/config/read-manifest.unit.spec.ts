import fs from "node:fs";
import path from "node:path";

import { readManifest } from "./read-manifest";

jest.mock("node:fs");

const mockedFs = jest.mocked(fs);

const APP_ROOT = "/app";
const YAML_PATH = path.join(APP_ROOT, "data_app.yaml");

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

  it("returns an empty manifest for non-object yaml", () => {
    setup({ [YAML_PATH]: "just a string\n" });

    expect(readManifest(APP_ROOT)?.manifest).toEqual({});
  });

  it("throws on unparseable yaml", () => {
    setup({ [YAML_PATH]: "allowed_hosts: [unclosed\n" });

    expect(() => readManifest(APP_ROOT)).toThrow(/Could not parse/);
  });

  describe("allowed_hosts", () => {
    it("reads allowed_hosts as a list of strings", () => {
      setup({
        [YAML_PATH]:
          "allowed_hosts:\n  - https://api.example.com\n  - https://*.acme.com\n",
      });

      expect(readManifest(APP_ROOT)?.manifest.allowed_hosts).toEqual([
        "https://api.example.com",
        "https://*.acme.com",
      ]);
    });

    it("is undefined when the manifest has no allowed_hosts key", () => {
      setup({ [YAML_PATH]: "name: My App\n" });

      expect(readManifest(APP_ROOT)?.manifest.allowed_hosts).toBeUndefined();
    });

    it("throws when allowed_hosts is not a list", () => {
      setup({ [YAML_PATH]: "allowed_hosts: nope\n" });

      expect(() => readManifest(APP_ROOT)).toThrow(
        /"allowed_hosts" must be a list/,
      );
    });

    it("throws on a non-string entry", () => {
      setup({ [YAML_PATH]: "allowed_hosts:\n  - https://ok.com\n  - 42\n" });

      expect(() => readManifest(APP_ROOT)).toThrow(/must be a string/);
    });
  });
});
