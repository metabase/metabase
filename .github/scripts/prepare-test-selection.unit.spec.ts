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

type Step = {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};

const WORKFLOWS = ["frontend.yml", "loki.yml"];

describe.each(Object.entries(SUITES))(
  "%s test selection",
  (suiteName, suite) => {
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

    function plan(files: unknown, total = 2) {
      return {
        [suite.filesKey]: files,
        stats: {
          [suite.totalKey]: total,
          [suite.selectedKey]: Array.isArray(files) ? files.length : 0,
        },
      };
    }

    function writePlan(value: unknown) {
      writeFileSync(
        join(dir, "test-plan/test-plan.json"),
        JSON.stringify(value),
      );
    }

    const output = () => readFileSync(join(dir, "output"), "utf8");

    it.each([{ files: ["one.spec.cjs"] }, { files: [] }])(
      "preserves an explicit selection: $files",
      ({ files }) => {
        writePlan(plan(files));
        prepareTestSelection(suiteName, env);
        expect(output()).toBe(
          `paths-file=${join(dir, suite.pathsFile)}\ncount=${files.length}\n`,
        );
        expect(
          JSON.parse(readFileSync(join(dir, suite.pathsFile), "utf8")),
        ).toEqual(files);
      },
    );

    it("writes the selection when invoked through Bun in CI", () => {
      writePlan(plan(["one.spec.cjs"]));
      const result = spawnSync(
        "bun",
        [resolve(__dirname, "prepare-test-selection.ts"), suiteName],
        { env, encoding: "utf8" },
      );
      expect(result.status === 0 ? "" : result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(output()).toBe(
        `paths-file=${join(dir, suite.pathsFile)}\ncount=1\n`,
      );
    });

    it("writes no paths file for a full selection", () => {
      writePlan(plan(["one.spec.cjs", "two.spec.cjs"]));
      prepareTestSelection(suiteName, env);
      expect(output()).toBe("");
    });

    it.each([
      null,
      {},
      plan("[]"),
      plan([null]),
      { ...plan([]), [suite.filesKey]: ["one.spec.cjs"] },
      plan([""]),
      plan(["one.spec.cjs"], 0),
    ])("runs in full for an invalid plan: %j", (value) => {
      writePlan(value);
      prepareTestSelection(suiteName, env);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("::warning::"),
      );
      expect(output()).toBe("");
    });

    it("ignores the other suites' selections", () => {
      const other = Object.values(SUITES).find((s) => s !== suite)!;
      writePlan({
        ...plan(["one.spec.cjs", "two.spec.cjs"]),
        [other.filesKey]: [],
      });
      prepareTestSelection(suiteName, env);
      expect(console.warn).not.toHaveBeenCalled();
      expect(output()).toBe("");
    });

    it.each(["missing", "truncated", "download failed"])(
      "runs in full when the artifact is %s",
      (scenario) => {
        if (scenario === "truncated") {
          writeFileSync(
            join(dir, "test-plan/test-plan.json"),
            `{"${suite.filesKey}":[`,
          );
        } else if (scenario === "download failed") {
          writePlan(plan([])); // Even a partial download must not be trusted.
          env.PLAN_DOWNLOADED = "failure";
        }
        prepareTestSelection(suiteName, env);
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining("::warning::"),
        );
        expect(output()).toBe("");
      },
    );
  },
);

describe("prepareTestSelection", () => {
  it("rejects an unknown suite", () => {
    expect(() =>
      prepareTestSelection("toString", {
        RUNNER_TEMP: tmpdir(),
        GITHUB_OUTPUT: join(tmpdir(), "output"),
      }),
    ).toThrow('Unknown test suite "toString"');
  });

  const selectionSteps = WORKFLOWS.flatMap((file) => {
    // js-yaml returns an untyped value, and these repository workflows define jobs with steps.
    const workflow = load(
      readFileSync(resolve(__dirname, "../workflows", file), "utf8"),
    ) as { jobs: Record<string, { steps?: Step[] }> };
    return Object.entries(workflow.jobs).flatMap(([job, { steps = [] }]) =>
      steps
        .filter((step) => step.run?.includes("prepare-test-selection.ts"))
        .map((step) => ({ name: `${file} ${job}`, step, steps })),
    );
  });

  it.each(selectionSteps)(
    "downloads the test plan before preparing the selection in $name",
    ({ step, steps }) => {
      const [, suiteName] =
        step.run!.match(/prepare-test-selection\.ts (\S+)/) ?? [];
      expect(Object.keys(SUITES)).toContain(suiteName);

      const [, downloadId] =
        step.env?.PLAN_DOWNLOADED?.match(/steps\.([\w-]+)\.outcome/) ?? [];
      const download = steps.find((s) => s.id === downloadId);
      expect(download).toMatchObject({
        uses: "actions/download-artifact@v8",
        with: { path: "${{ runner.temp }}/test-plan" },
      });
      expect(download!.with!["artifact-ids"]).toBeTruthy();
      expect(download!.if).toBe(step.if);
      expect(steps.indexOf(download!)).toBeLessThan(steps.indexOf(step));
    },
  );
});
