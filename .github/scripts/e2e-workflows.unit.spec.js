const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { load } = require("js-yaml");

const workflow = (name) =>
  load(fs.readFileSync(path.join(__dirname, "../workflows", name), "utf8"));

describe("E2E workflow result", () => {
  const script = workflow("e2e-tests.yml").jobs["e2e-tests-result"].steps.find(
    (step) => step.name === "Test results",
  ).run;

  it.each([
    {
      scenario: "pass when E2E is explicitly skipped",
      skip: "true",
      matrix: "skipped",
      tests: "skipped",
      hasTests: "",
      exitCode: 0,
    },
    {
      scenario: "pass when the plan selects no tests",
      skip: "false",
      matrix: "success",
      tests: "skipped",
      hasTests: "false",
      exitCode: 0,
    },
    {
      scenario: "pass when all workers pass",
      skip: "false",
      matrix: "success",
      tests: "success",
      hasTests: "true",
      exitCode: 0,
    },
    {
      scenario: "fail when the matrix builder fails",
      skip: "false",
      matrix: "failure",
      tests: "skipped",
      hasTests: "",
      exitCode: 1,
    },
    {
      scenario: "fail when the matrix builder is cancelled",
      skip: "false",
      matrix: "cancelled",
      tests: "skipped",
      hasTests: "",
      exitCode: 1,
    },
    {
      scenario: "fail when a worker fails",
      skip: "false",
      matrix: "success",
      tests: "failure",
      hasTests: "true",
      exitCode: 1,
    },
    {
      scenario: "fail when workers are unexpectedly skipped",
      skip: "false",
      matrix: "success",
      tests: "skipped",
      hasTests: "true",
      exitCode: 1,
    },
  ])("should $scenario", ({ skip, matrix, tests, hasTests, exitCode }) => {
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

    expect(result.status).toBe(exitCode);
  });
});

describe("E2E plan handoff", () => {
  it("should give the matrix builder the selected spec paths", () => {
    const job = workflow("e2e-matrix-builder.yml").jobs["build-matrix"];
    const matrix = job.steps.find((step) => step.id === "matrix");

    expect(matrix.env.E2E_SPEC_PATHS_FILE).toBe(
      "${{ steps.selection.outputs.paths-file }}",
    );
  });

  it("should forward the artifact only when the matrix uses a selection", () => {
    const builder = workflow("e2e-matrix-builder.yml");

    expect(builder.jobs["build-matrix"].outputs["test-plan-artifact-id"]).toBe(
      "${{ steps.selection.outputs.paths-file && inputs.test-plan-artifact-id || '' }}",
    );
    expect(
      builder.on.workflow_call.outputs["test-plan-artifact-id"].value,
    ).toBe("${{ jobs.build-matrix.outputs.test-plan-artifact-id }}");
  });

  it("should give workers the artifact used to build the matrix", () => {
    const jobs = workflow("e2e-tests.yml").jobs;
    const worker = workflow("e2e-test.yml").jobs["e2e-tests"];
    const selection = worker.steps.find((step) => step.id === "selection");

    expect(jobs["e2e-matrix-builder"].with["test-plan-artifact-id"]).toBe(
      "${{ inputs.test-plan-artifact-id }}",
    );
    expect(jobs["e2e-tests"].with["test-plan-artifact-id"]).toBe(
      "${{ needs.e2e-matrix-builder.outputs.test-plan-artifact-id }}",
    );
    expect(selection.with["test-plan-artifact-id"]).toBe(
      "${{ inputs.test-plan-artifact-id }}",
    );
  });

  it.each(["split-e2e", "tagged-e2e"])(
    "should give the selected spec paths to %s",
    (stepId) => {
      const step = workflow("e2e-test.yml").jobs["e2e-tests"].steps.find(
        (step) => step.id === stepId,
      );

      expect(step.env.E2E_SPEC_PATHS_FILE).toBe(
        "${{ steps.selection.outputs.paths-file }}",
      );
    },
  );
});
