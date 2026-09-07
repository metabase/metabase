const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { plugin: grep } = require("@cypress/grep/plugin");
const split = require("cypress-split");

describe("Planned E2E shards", () => {
  let dir;
  let selected;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-planned-shards-"));
    const fixtures = {
      "a.cy.spec.js": 'it("regular a", () => {});',
      "b.cy.spec.js": 'it("regular b", () => {});',
      "oss.cy.spec.js": 'it("OSS", { tags: "@OSS" }, () => {});',
      "mongo.cy.spec.js": 'it("Mongo", { tags: "@mongo" }, () => {});',
      "python.cy.spec.js": 'it("Python", { tags: "@python" }, () => {});',
      "unselected.cy.spec.js": 'it("unselected", () => {});',
    };
    for (const [name, contents] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(dir, name), contents);
    }
    selected = Object.keys(fixtures)
      .filter((name) => name !== "unselected.cy.spec.js")
      .map((name) => path.join(dir, name));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const configFor = (tags) => ({
    projectRoot: dir,
    specPattern: [...selected],
    excludeSpecPattern: [],
    testingType: "e2e",
    env: {},
    expose: {
      grepTags: tags,
      grepFilterSpecs: true,
      grepOmitFiltered: true,
      grepIntegrationFolder: dir,
    },
  });

  it("should partition only selected regular specs after tag filtering", () => {
    const sharded = [];
    for (let index = 0; index < 2; index++) {
      const config = configFor("-@mongo+-@python+-@OSS");
      config.env = { split: 2, splitIndex: String(index), splitSummary: false };
      grep(config);
      split(() => {}, config);
      sharded.push(...config.specPattern);
    }

    expect(sharded.map((file) => path.basename(file)).sort()).toEqual([
      "a.cy.spec.js",
      "b.cy.spec.js",
    ]);
  });

  it.each([
    ["@OSS @prerelease+-@EE", "oss.cy.spec.js"],
    ["@mongo", "mongo.cy.spec.js"],
    ["@python", "python.cy.spec.js"],
  ])("should retain selected specs for %s", (tags, name) => {
    const config = configFor(tags);
    grep(config);

    expect(config.specPattern).toEqual([path.join(dir, name)]);
  });

  it("should keep an unmatched tag filter within the selected files", () => {
    const config = configFor("@mongo");
    config.specPattern = [path.join(dir, "a.cy.spec.js")];
    grep(config);

    expect(config.specPattern).toEqual([path.join(dir, "a.cy.spec.js")]);
  });
});
