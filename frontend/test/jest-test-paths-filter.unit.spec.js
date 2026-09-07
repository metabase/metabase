const fs = require("fs");
const os = require("os");
const path = require("path");

const filter = require("./jest-test-paths-filter");

describe("jest-test-paths-filter", () => {
  const originalPathsFile = process.env.JEST_TEST_PATHS_FILE;
  let tempDir;
  let pathsFile;

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
