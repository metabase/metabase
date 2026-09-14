const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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
  it("should give shards the plan the matrix was built from", () => {
    const { with: inputs } = workflow("e2e-tests.yml").jobs["e2e-tests"];
    const download = workflow("e2e-test.yml").jobs["e2e-tests"].steps.find(
      (step) => step.name === "Download test plan",
    );

    expect(inputs["test-plan-artifact-id"]).toBe(
      "${{ needs.e2e-matrix-builder.outputs.test-plan-artifact-id }}",
    );
    expect(download["continue-on-error"]).toBeUndefined();
  });
});
