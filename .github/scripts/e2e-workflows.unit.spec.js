const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { load } = require("js-yaml");

const workflow = (name) =>
  load(fs.readFileSync(path.join(__dirname, "../workflows", name), "utf8"));

describe("E2E workflow result", () => {
  const script =
    workflow("e2e-tests.yml").jobs["e2e-tests-result"].steps[0].run;

  it.each([
    ["true", "skipped", "skipped", "", 0],
    ["false", "success", "skipped", "false", 0],
    ["false", "success", "success", "true", 0],
    ["false", "failure", "skipped", "", 1],
    ["false", "cancelled", "skipped", "", 1],
    ["false", "success", "failure", "true", 1],
    ["false", "success", "skipped", "true", 1],
  ])(
    "should check skip=%s, matrix=%s, tests=%s, hasTests=%s",
    (skip, matrix, tests, hasTests, status) => {
      const result = spawnSync("bash", ["-e"], {
        input: script,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          SKIP: skip,
          MATRIX_RESULT: matrix,
          E2E_TESTS_RESULT: tests,
          HAS_TESTS: hasTests,
        },
      });

      expect(result.status).toBe(status);
    },
  );
});

describe("E2E plan handoff", () => {
  it.each([
    ["e2e-matrix-builder.yml", "build-matrix"],
    ["e2e-test.yml", "e2e-tests"],
  ])("should write a large JSON plan in %s", (file, job) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-plan-handoff-"));
    try {
      const files = Array.from(
        { length: 4000 },
        (_, i) => `e2e/test/scenarios/folder with spaces/${i},$name.cy.spec.ts`,
      );
      const step = workflow(file).jobs[job].steps.find(
        (step) => step.name === "Write spec plan",
      );
      const script = step.run.replace(
        "${{ inputs.spec-files }}",
        JSON.stringify(files),
      );
      const result = spawnSync("bash", ["-e"], {
        input: script,
        cwd: dir,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, "e2e-spec-files.json"))),
      ).toEqual(files);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
