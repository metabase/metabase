const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readSpecPlan } = require("../../e2e/runner/read-spec-plan");

jest.mock("cypress", () => ({ defineConfig: (config) => config }));
jest.mock("../../e2e/support/config", () => ({
  mainConfig: {
    specPattern: "e2e/test/**/*.cy.spec.{js,ts}",
    viewportWidth: 1280,
  },
  defaultConfig: { viewportWidth: 1280 },
}));

describe("E2E spec plan", () => {
  const originalPathsFile = process.env.E2E_SPEC_PATHS_FILE;
  let tempDir;
  let pathsFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-spec-plan-"));
    pathsFile = path.join(tempDir, "specs.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalPathsFile === undefined) {
      delete process.env.E2E_SPEC_PATHS_FILE;
    } else {
      process.env.E2E_SPEC_PATHS_FILE = originalPathsFile;
    }
  });

  it("should return null when there is no plan", () => {
    expect(readSpecPlan("")).toBeNull();
    expect(readSpecPlan(undefined)).toBeNull();
  });

  it("should keep an empty plan empty", () => {
    fs.writeFileSync(pathsFile, "[]");
    expect(readSpecPlan(pathsFile)).toEqual([]);
  });

  it("should preserve paths in a large JSON plan", () => {
    const files = Array.from(
      { length: 4000 },
      (_, i) => `e2e/test/scenarios/folder with spaces/${i},spec.cy.spec.ts`,
    );
    fs.writeFileSync(pathsFile, JSON.stringify(files));
    expect(readSpecPlan(pathsFile)).toEqual(files);
  });

  it.each(["{", "null", '""', "{}", "[null]", '[""]'])(
    "should reject an invalid plan: %s",
    (contents) => {
      fs.writeFileSync(pathsFile, contents);
      expect(() => readSpecPlan(pathsFile)).toThrow();
    },
  );

  const loadConfig = (file) => {
    let config;
    jest.isolateModules(() => {
      config = require(`../../e2e/support/${file}`);
    });
    return config;
  };

  it("should read the selected spec pattern in the Cypress config process", () => {
    const files = [
      "e2e/test/scenarios/a.cy.spec.js",
      "e2e/test/scenarios/b.cy.spec.js",
    ];
    fs.writeFileSync(pathsFile, JSON.stringify(files));
    process.env.E2E_SPEC_PATHS_FILE = pathsFile;

    expect(loadConfig("cypress.config").e2e).toEqual({
      specPattern: files,
      viewportWidth: 1280,
    });
  });

  it("should preserve the default pattern when there is no plan", () => {
    process.env.E2E_SPEC_PATHS_FILE = "";

    expect(loadConfig("cypress.config").e2e.specPattern).toBe(
      "e2e/test/**/*.cy.spec.{js,ts}",
    );
  });

  it("should leave snapshot generation outside the plan", () => {
    fs.writeFileSync(pathsFile, "[]");
    process.env.E2E_SPEC_PATHS_FILE = pathsFile;

    expect(loadConfig("cypress-snapshots.config").e2e.specPattern).toBe(
      "e2e/snapshot-creators/**/*.cy.snap.js",
    );
  });
});
