import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-commonjs -- Match Jest's direct CommonJS loading contract.
const filter = require("../../frontend/test/jest-test-paths-filter");

describe("jest-test-paths-filter", () => {
  const originalPathsFile = process.env.JEST_TEST_PATHS_FILE;
  let tempDir: string;
  let pathsFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jest-test-paths-"));
    pathsFile = path.join(tempDir, "paths.json");
    process.env.JEST_TEST_PATHS_FILE = pathsFile;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalPathsFile === undefined) {
      delete process.env.JEST_TEST_PATHS_FILE;
    } else {
      process.env.JEST_TEST_PATHS_FILE = originalPathsFile;
    }
  });

  it("should keep the listed paths and drop the rest", () => {
    const one = path.resolve("frontend/one.unit.spec.ts");
    const two = path.resolve("frontend/two.unit.spec.ts");
    const three = path.resolve("frontend/three.unit.spec.ts");
    fs.writeFileSync(pathsFile, JSON.stringify([one, two]));

    expect(filter([one, three, two])).toEqual({ filtered: [one, two] });
  });

  it("should resolve relative paths against the working directory", () => {
    fs.writeFileSync(pathsFile, JSON.stringify(["frontend/one.unit.spec.ts"]));
    const one = path.resolve("frontend/one.unit.spec.ts");
    const two = path.resolve("frontend/two.unit.spec.ts");

    expect(filter([one, two])).toEqual({ filtered: [one] });
  });
});
