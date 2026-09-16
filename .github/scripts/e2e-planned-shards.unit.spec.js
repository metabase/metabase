const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { prepareTestSelection } = require("./prepare-test-selection");

// Load the plugins in Node so their Cypress globals stay out of the frontend type check.
const runPluginsScript = `
  const fs = require("node:fs");
  const path = require("node:path");
  const { setupSpecSelection } = require(process.env.SPEC_SELECTION_MODULE);
  const { readSpecPlan } = require(process.env.SPEC_PLAN_READER);
  const { tags, splitIndex } = JSON.parse(process.env.PLUGIN_OPTIONS);
  const config = {
    projectRoot: path.resolve("../.."),
    specPattern: readSpecPlan(process.env.E2E_SPEC_PATHS_FILE),
    excludeSpecPattern: [],
    testingType: "e2e",
    env: splitIndex === undefined ? {} : {
      split: 2,
      splitIndex: String(splitIndex),
      splitFile: "./e2e/support/timings.json",
      splitSummary: false,
    },
    expose: {
      grepTags: tags,
    },
  };
  setupSpecSelection(() => {}, config);
  fs.writeFileSync(process.env.PLUGIN_RESULT_FILE, JSON.stringify(config.specPattern));
`;

describe("Planned E2E shards", () => {
  let dir;
  let total;

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "e2e-planned-shards-")),
    );
    const fixtures = {
      "a.cy.spec.js": 'it("regular a", () => {});',
      "b.cy.spec.js": 'it("regular b", () => {});',
      "c.cy.spec.js": 'it("regular c", () => {});',
      "oss.cy.spec.js": 'it("OSS", { tags: "@OSS" }, () => {});',
      "mongo.cy.spec.js": 'it("Mongo", { tags: "@mongo" }, () => {});',
      "python.cy.spec.js": 'it("Python", { tags: "@python" }, () => {});',
      "unselected.cy.spec.js": 'it("unselected", () => {});',
      "unselected-oss.cy.spec.js": 'it("OSS", { tags: "@OSS" }, () => {});',
      "unselected-mongo.cy.spec.js":
        'it("Mongo", { tags: "@mongo" }, () => {});',
      "unselected-python.cy.spec.js":
        'it("Python", { tags: "@python" }, () => {});',
    };
    for (const [name, contents] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(dir, name), contents);
    }
    total = Object.keys(fixtures).length;
    const selected = Object.keys(fixtures)
      .filter((name) => !name.startsWith("unselected"))
      .map((name) => path.join(dir, name));
    fs.mkdirSync(path.join(dir, "test-plan"));
    fs.mkdirSync(path.join(dir, "e2e/support"), { recursive: true });
    writeSelection(selected);
    fs.writeFileSync(
      path.join(dir, "e2e/support/timings.json"),
      JSON.stringify({
        durations: [
          { spec: "../../a.cy.spec.js", duration: 1 },
          { spec: "../../b.cy.spec.js", duration: 100 },
          { spec: "../../c.cy.spec.js", duration: 1 },
        ],
      }),
    );
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writeSelection(files) {
    fs.writeFileSync(
      path.join(dir, "test-plan/test-plan.json"),
      JSON.stringify({
        e2e_specs_to_run: files,
        stats: {
          e2e_specs_all: total,
          e2e_specs_to_run_usage: files.length,
        },
      }),
    );
    prepareTestSelection("e2e", {
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: path.join(dir, "output"),
      PLAN_DOWNLOADED: "success",
    });
  }

  function runPlugins(options) {
    const resultFile = path.join(dir, "result.json");
    const result = spawnSync(process.execPath, ["-e", runPluginsScript], {
      cwd: path.join(dir, "e2e/support"),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        CI: "true",
        SPEC_SELECTION_MODULE: path.resolve(
          __dirname,
          "../../e2e/support/spec-selection.js",
        ),
        SPEC_PLAN_READER: path.resolve(
          __dirname,
          "../../e2e/runner/read-spec-plan.js",
        ),
        E2E_SPEC_PATHS_FILE: path.join(dir, "e2e-specs.json"),
        PLUGIN_OPTIONS: JSON.stringify(options),
        PLUGIN_RESULT_FILE: resultFile,
      },
    });
    expect(result.status === 0 ? "" : result.stderr).toBe("");
    expect(result.status).toBe(0);
    return JSON.parse(fs.readFileSync(resultFile, "utf8"));
  }

  it("should split only selected regular specs using their recorded durations", () => {
    const shards = [0, 1].map((splitIndex) =>
      runPlugins({ tags: "-@mongo+-@python+-@OSS", splitIndex }).map((file) =>
        path.basename(file),
      ),
    );

    expect(shards).toEqual([
      ["b.cy.spec.js"],
      ["a.cy.spec.js", "c.cy.spec.js"],
    ]);
  });

  it.each([
    ["@OSS @prerelease+-@EE", "oss.cy.spec.js"],
    ["@mongo", "mongo.cy.spec.js"],
    ["@python", "python.cy.spec.js"],
  ])("should exclude unselected specs with matching %s tags", (tags, name) => {
    expect(runPlugins({ tags })).toEqual([path.join(dir, name)]);
  });

  it("should keep an unmatched tag filter within the selected files", () => {
    const file = path.join(dir, "a.cy.spec.js");
    writeSelection([file]);

    expect(runPlugins({ tags: "@mongo" })).toEqual([file]);
  });
});
