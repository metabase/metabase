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

import { SUITES, prepareTestSelection } from "./prepare-test-selection";

type Suite = (typeof SUITES)[keyof typeof SUITES];

type Step = {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | boolean>;
};

const SCRIPT = resolve(__dirname, "prepare-test-selection.ts");
const SUITE_NAMES = ["unit", "loki", "e2e"] satisfies (keyof typeof SUITES)[];

function loadWorkflow(file: string) {
  // js-yaml returns an untyped value, and these repository workflows define jobs with steps.
  return load(
    readFileSync(resolve(__dirname, "../workflows", file), "utf8"),
  ) as {
    jobs: Record<
      string,
      { if?: string; outputs?: Record<string, string>; steps?: Step[] }
    >;
  };
}

function loadAction() {
  // js-yaml returns an untyped value, and this repository action defines outputs and steps.
  return load(
    readFileSync(
      resolve(__dirname, "../actions/prepare-test-selection/action.yml"),
      "utf8",
    ),
  ) as {
    outputs: Record<string, { value: string }>;
    runs: { steps: Step[] };
  };
}

describe("prepareTestSelection", () => {
  const { loki } = SUITES;
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    dir = mkdtempSync(join(tmpdir(), "test-selection-"));
    mkdirSync(join(dir, "test-plan"));
    writeFileSync(join(dir, "output"), "");
    env = {
      ...process.env,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: join(dir, "output"),
      PLAN_DOWNLOADED: "success",
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function plan(files: unknown, total = 2, suite: Suite = loki) {
    return {
      [suite.filesKey]: files,
      stats: {
        [suite.totalKey]: total,
        [suite.selectedKey]: Array.isArray(files) ? files.length : 0,
      },
    };
  }

  function writePlan(value: unknown) {
    writeFileSync(join(dir, "test-plan/test-plan.json"), JSON.stringify(value));
  }

  const output = () => readFileSync(join(dir, "output"), "utf8");

  it.each([{ files: ["one.spec.cjs"] }, { files: [] }])(
    "preserves an explicit selection: $files",
    ({ files }) => {
      writePlan(plan(files));
      prepareTestSelection("loki", env);
      expect(output()).toBe(
        `paths-file=${join(dir, loki.pathsFile)}\nselection=${files.length > 0 ? "narrowed" : "empty"}\n`,
      );
      expect(
        JSON.parse(readFileSync(join(dir, loki.pathsFile), "utf8")),
      ).toEqual(files);
    },
  );

  it("writes the selection when invoked through Bun in CI", () => {
    writePlan(plan(["one.spec.cjs"]));
    const result = spawnSync("bun", [SCRIPT, "loki"], {
      env,
      encoding: "utf8",
    });
    expect(result.status === 0 ? "" : result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(output()).toBe(
      `paths-file=${join(dir, loki.pathsFile)}\nselection=narrowed\n`,
    );
  });

  it("writes no paths file for a full selection", () => {
    writePlan(plan(["one.spec.cjs", "two.spec.cjs"]));
    prepareTestSelection("loki", env);
    expect(output()).toBe("selection=full\n");
  });

  it.each([
    null,
    {},
    plan("[]"),
    plan([null]),
    { ...plan([]), [loki.filesKey]: ["one.spec.cjs"] },
    plan([""]),
    plan(["one.spec.cjs"], 0),
  ])("runs in full for an invalid plan: %j", (value) => {
    writePlan(value);
    prepareTestSelection("loki", env);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("::warning::"),
    );
    expect(output()).toBe("");
  });

  it.each([
    { scenario: "the test plan is missing", setup: () => {} },
    {
      scenario: "the test plan is truncated",
      setup: () => {
        writeFileSync(
          join(dir, "test-plan/test-plan.json"),
          `{"${loki.filesKey}":[`,
        );
      },
    },
    {
      scenario: "the download failed",
      setup: () => {
        writePlan(plan([])); // Even a partial download must not be trusted.
        env.PLAN_DOWNLOADED = "failure";
      },
    },
  ])("runs in full when $scenario", ({ setup }) => {
    setup();
    prepareTestSelection("loki", env);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("::warning::"),
    );
    expect(output()).toBe("");
  });

  it.each(SUITE_NAMES)(
    "reads the %s selection from its own plan keys",
    (suiteName) => {
      const suite = SUITES[suiteName];
      writePlan(plan(["one.spec.cjs"], 2, suite));
      prepareTestSelection(suiteName, env);
      expect(output()).toBe(
        `paths-file=${join(dir, suite.pathsFile)}\nselection=narrowed\n`,
      );
      expect(
        JSON.parse(readFileSync(join(dir, suite.pathsFile), "utf8")),
      ).toEqual(["one.spec.cjs"]);
    },
  );

  it("ignores the other suites' selections", () => {
    writePlan({
      ...plan(["one.spec.cjs", "two.spec.cjs"]),
      [SUITES.unit.filesKey]: [],
      [SUITES.e2e.filesKey]: [],
    });
    prepareTestSelection("loki", env);
    expect(console.warn).not.toHaveBeenCalled();
    expect(output()).toBe("selection=full\n");
  });

  it("rejects an unknown suite", () => {
    const result = spawnSync("bun", [SCRIPT, "toString"], {
      env,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown test suite "toString"');
  });
});

describe("test selection workflow steps", () => {
  const ACTION = "./.github/actions/prepare-test-selection";
  const CONSUMERS: Record<
    string,
    { suite: keyof typeof SUITES; "require-download"?: boolean }
  > = {
    "frontend.yml": { suite: "unit" },
    "loki.yml": { suite: "loki" },
    "e2e-matrix-builder.yml": { suite: "e2e" },
    // The matrix was sized for the planned specs, so a shard fails when the plan download fails.
    "e2e-test.yml": { suite: "e2e", "require-download": true },
  };

  it("skips Loki visual tests only for an empty story selection", () => {
    const { jobs } = loadWorkflow("loki.yml");
    expect(jobs["story-selection"].outputs?.selection).toBe(
      "${{ steps.loki-selection.outputs.selection }}",
    );
    expect(jobs["visual-test"].if).toContain(
      "needs.story-selection.outputs.selection != 'empty'",
    );
    expect(jobs["visual-test"].if).not.toMatch(/outputs\.[\w-]+ *[!=]= *'\d+'/);
  });

  it.each(Object.entries(CONSUMERS))(
    "selects tests through the composite action in %s",
    (file, { suite, ...inputs }) => {
      const steps = Object.values(loadWorkflow(file).jobs).flatMap(
        ({ steps = [] }) => steps.filter((step) => step.uses === ACTION),
      );

      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.with).toEqual({
          suite,
          "test-plan-artifact-id": expect.stringMatching(/^\$\{\{ .+ \}\}$/),
          ...inputs,
        });
      }
    },
  );

  it("downloads the test plan before preparing the selection", () => {
    const { outputs, runs } = loadAction();
    const [download, prepare] = runs.steps;

    expect(download).toMatchObject({
      uses: expect.stringMatching(/^actions\/download-artifact@/),
      "continue-on-error": "${{ inputs.require-download != 'true' }}",
      with: {
        "artifact-ids": "${{ inputs.test-plan-artifact-id }}",
        path: "${{ runner.temp }}/test-plan",
      },
    });
    expect(prepare).toMatchObject({
      env: { PLAN_DOWNLOADED: `\${{ steps.${download.id}.outcome }}` },
      run: expect.stringContaining(
        'prepare-test-selection.ts "${{ inputs.suite }}"',
      ),
    });
    expect(outputs).toMatchObject({
      "paths-file": {
        value: `\${{ steps.${prepare.id}.outputs.paths-file }}`,
      },
      selection: { value: `\${{ steps.${prepare.id}.outputs.selection }}` },
    });
  });
});
