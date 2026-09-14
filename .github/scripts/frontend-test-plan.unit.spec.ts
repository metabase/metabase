import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { load } from "js-yaml";

import { findRunnerFailure } from "./check-unit-test-results";
import { prepareUnitTestSelection } from "./prepare-unit-test-selection";

type Step = { name: string; run?: string; "continue-on-error"?: boolean };
// js-yaml returns an untyped value; this repository workflow defines the job's steps.
const workflow = load(
  readFileSync(resolve(__dirname, "../workflows/frontend.yml"), "utf8"),
) as { jobs: { "fe-tests-unit": { steps: Step[] } } };
const steps = workflow.jobs["fe-tests-unit"].steps;
const checkScript = resolve(__dirname, "check-unit-test-results.ts");
const filter = resolve(
  __dirname,
  "../../frontend/test/jest-test-paths-filter.ts",
);

describe("frontend test plan handoff", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    dir = mkdtempSync(join(tmpdir(), "frontend-test-plan-"));
    mkdirSync(join(dir, "test-plan"));
    writeFileSync(join(dir, "output"), "");
    env = {
      ...process.env,
      NODE_OPTIONS: "",
      JEST_TEST_PATHS_FILE: "",
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: join(dir, "output"),
      PLAN_DOWNLOADED: "success",
      JEST_JUNIT_OUTPUT_DIR: dir,
      JEST_JUNIT_OUTPUT_NAME: "junit.xml",
      UNIT_TEST_RESULTS_FILE: join(dir, "unit-test-results.json"),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function plan(files: string[], total = 2) {
    return {
      fe_unit_specs_to_run: files,
      stats: { unit_specs_all: total, unit_specs_to_run_usage: files.length },
    };
  }

  function writePlan(value: unknown) {
    writeFileSync(join(dir, "test-plan/test-plan.json"), JSON.stringify(value));
  }

  it.each([{ files: ["one.spec.cjs"] }, { files: [] }])(
    "preserves an explicit selection: $files",
    ({ files }) => {
      writePlan(plan(files));
      prepareUnitTestSelection(env);
      expect(readFileSync(join(dir, "output"), "utf8")).toContain(
        "paths-file=",
      );
      expect(
        JSON.parse(readFileSync(join(dir, "unit-specs.json"), "utf8")),
      ).toEqual(files);
    },
  );

  it("writes the selection when invoked through Bun in CI", () => {
    writePlan(plan(["one.spec.cjs"]));
    const result = spawnSync(
      "bun",
      [resolve(__dirname, "prepare-unit-test-selection.ts")],
      { env, encoding: "utf8" },
    );
    expect(result.status === 0 ? "" : result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, "output"), "utf8")).toBe(
      `paths-file=${join(dir, "unit-specs.json")}\n`,
    );
    expect(
      JSON.parse(readFileSync(join(dir, "unit-specs.json"), "utf8")),
    ).toEqual(["one.spec.cjs"]);
  });

  it("bypasses the filter for a full selection", () => {
    writePlan(plan(["one.spec.cjs", "two.spec.cjs"]));
    prepareUnitTestSelection(env);
    expect(readFileSync(join(dir, "output"), "utf8")).toBe("");
  });

  it.each([
    null,
    {},
    { ...plan([]), fe_unit_specs_to_run: "[]" },
    { ...plan([]), fe_unit_specs_to_run: [null] },
    { ...plan([]), fe_unit_specs_to_run: ["one.spec.cjs"] },
    plan(["one.spec.cjs"], 0),
  ])("runs in full for an invalid plan: %j", (value) => {
    writePlan(value);
    prepareUnitTestSelection(env);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("::warning::"),
    );
    expect(readFileSync(join(dir, "output"), "utf8")).toBe("");
  });

  it.each(["missing", "truncated", "download failed"])(
    "runs in full when the artifact is %s",
    (scenario) => {
      if (scenario === "truncated") {
        writeFileSync(
          join(dir, "test-plan/test-plan.json"),
          '{"fe_unit_specs_to_run":[',
        );
      } else if (scenario === "download failed") {
        writePlan(plan([])); // Even a partial download must not be trusted.
        env.PLAN_DOWNLOADED = "failure";
      }
      prepareUnitTestSelection(env);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("::warning::"),
      );
      expect(readFileSync(join(dir, "output"), "utf8")).toBe("");
    },
  );

  function runJest(files: Record<string, string>, useFilter = false) {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(dir, name), source);
    }
    return spawnSync(
      process.execPath,
      [
        require.resolve("jest/bin/jest"),
        "--config",
        JSON.stringify({
          rootDir: dir,
          testMatch: ["**/*.spec.cjs"],
          reporters: ["default", require.resolve("jest-junit")],
          ...(useFilter && { filter }),
        }),
        "--runInBand",
        "--watch=false",
        "--json",
        `--outputFile=${env.UNIT_TEST_RESULTS_FILE}`,
        ...(useFilter ? ["--passWithNoTests"] : []),
      ],
      { cwd: dir, env, encoding: "utf8" },
    );
  }

  it("lets ordinary assertion failures reach quarantine", () => {
    expect(
      runJest({ "fail.spec.cjs": "test('fails', () => expect(1).toBe(2));" })
        .status,
    ).toBe(1);
    expect(findRunnerFailure(env)).toBeNull();
  });

  it("lets suite hook failures reach quarantine", () => {
    expect(
      runJest({
        "hook.spec.cjs":
          "test('passes', () => {}); afterAll(() => { throw new Error('hook'); });",
      }).status,
    ).toBe(1);
    expect(readFileSync(join(dir, "junit.xml"), "utf8")).toContain(
      "Test execution failure",
    );
    expect(findRunnerFailure(env)).toBeNull();
  });

  it("fails a filter crash even though the test step permits errors", () => {
    env.JEST_TEST_PATHS_FILE = join(dir, "broken.json");
    writeFileSync(env.JEST_TEST_PATHS_FILE, "[");
    expect(
      runJest({ "pass.spec.cjs": "test('passes', () => {});" }, true).status,
    ).toBe(1);
    const result = spawnSync("bun", [checkScript], { env, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error::");
    const step = steps.find((step) =>
      step.run?.includes("check-unit-test-results.ts"),
    );
    expect(step?.["continue-on-error"]).toBeUndefined();
  });

  it("fails suite startup errors even alongside ordinary assertion failures", () => {
    expect(
      runJest({
        "crash.spec.cjs": "throw new Error('startup crash');",
        "fail.spec.cjs": "test('fails', () => expect(1).toBe(2));",
      }).status,
    ).toBe(1);
    expect(readFileSync(join(dir, "junit.xml"), "utf8")).not.toContain(
      "crash.spec.cjs",
    );
    expect(findRunnerFailure(env)).toContain("crash.spec.cjs");
  });

  it("fails when JUnit results are missing", () => {
    runJest({ "fail.spec.cjs": "test('fails', () => expect(1).toBe(2));" });
    rmSync(join(dir, "junit.xml"));
    expect(findRunnerFailure(env)).not.toBeNull();
  });

  it.each([true, false])(
    "loads the TypeScript filter natively with an empty selection: %s",
    (empty) => {
      writePlan(plan(empty ? [] : [join(dir, "pass.spec.cjs")]));
      prepareUnitTestSelection(env);
      env.JEST_TEST_PATHS_FILE = join(dir, "unit-specs.json");
      const result = runJest(
        {
          "pass.spec.cjs": "test('passes', () => {});",
          "fail.spec.cjs":
            "test('excluded', () => { throw new Error('must not run'); });",
        },
        true,
      );
      expect(result.status === 0 ? "" : result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
  );
});
