// Runs the specs in fixtures/ and dom-fixtures/ under jest's own runner and
// under the node:test runner in frontend/test/harness, and checks that both
// report the same results. Each fixture is a case where the two runners once
// differed, and most of them fail on purpose.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Runner = "jest" | "harness";

type JestJson = {
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numFailedTestSuites: number;
  snapshot: { unchecked: number; added: number };
  testResults: Array<{
    name: string;
    status: string;
    assertionResults: Array<{ fullName: string; status: string }>;
  }>;
};

type FileSummary = {
  status: string;
  tests: Record<string, string>;
};

const ROOT = path.resolve(__dirname, "../../..");
const FIXTURES = path.join(__dirname, "fixtures");
const DOM_FIXTURES = path.join(__dirname, "dom-fixtures");
const JEST = path.join(ROOT, "node_modules/jest/bin/jest.js");
const RUNNER = path.join(ROOT, "frontend/test/harness/jest-runner.ts");
const SEQUENCER = path.join(__dirname, "given-order-sequencer.js");
const RUN_TIMEOUT_MS = 120_000;

// jest's own runner crashes its worker on these, so it reports only that the
// file failed. The node:test runner fails the test that caused it.
const FIXTURES_THAT_CRASH_JEST = [
  "after-all-rejection.fixture.js",
  "immediate-rejection.fixture.js",
];

// The node:test runner skips the rest of this file on purpose. React stays
// loaded in its worker, so the next tests could not render.
const FIXTURE_THAT_LEAVES_REACT_STUCK = "react-stuck.fixture.js";

describe("the node:test runner", () => {
  it(
    "reports the same results as jest's own runner",
    () => {
      const jest = summarize(runJest("jest", ["--ci"]));
      const harness = summarize(runJest("harness", ["--ci"]));

      for (const file of [
        ...FIXTURES_THAT_CRASH_JEST,
        FIXTURE_THAT_LEAVES_REACT_STUCK,
      ]) {
        expect([jest[file].status, harness[file].status]).toEqual([
          "failed",
          "failed",
        ]);
        delete jest[file];
        delete harness[file];
      }
      expect(harness).toEqual(jest);
      // The fixture that runs last in the worker passes, so no error left
      // an earlier file.
      expect(harness["z.fixture.js"].status).toBe("passed");
    },
    RUN_TIMEOUT_MS,
  );

  it.each([
    {
      fixture: FIXTURE_THAT_LEAVES_REACT_STUCK,
      tests: {
        "leaves React inside a commit": "failed",
        "is skipped, because React cannot render": "pending",
        "a later block is skipped too": "pending",
      },
    },
    {
      fixture: "react-stuck-in-after-all.fixture.js",
      tests: {
        "passes before its afterAll hook leaves React stuck": "passed",
      },
    },
  ])(
    "runs the next file in a new worker after $fixture leaves React stuck",
    ({ fixture, tests }) => {
      const files = [fixture, "after-react-stuck.fixture.js"];
      const paths = files.map((file) => path.join(DOM_FIXTURES, file));
      const runLog = path.join(
        os.tmpdir(),
        `harness-compat-runs-${process.pid}-${Date.now()}.log`,
      );
      try {
        const results = summarize(
          runJest("harness", [`--testSequencer=${SEQUENCER}`, ...paths], {
            HARNESS_COMPAT_ORDER: JSON.stringify(paths),
            HARNESS_COMPAT_RUN_LOG: runLog,
          }),
        );
        const runs = fs
          .readFileSync(runLog, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split(" "));

        expect(results[fixture]).toEqual({ status: "failed", tests });
        expect(results["after-react-stuck.fixture.js"].status).toBe("passed");
        expect(runs.map(([file]) => file)).toEqual(files);
        expect(runs[1][1]).not.toBe(runs[0][1]);
      } finally {
        fs.rmSync(runLog, { force: true });
      }
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "applies the --testTimeout option",
    () => {
      const args = ["--testTimeout=25", fixture("slow.fixture.js")];
      expect(runJest("harness", args).numFailedTests).toBe(1);
      expect(runJest("jest", args).numFailedTests).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "keeps the snapshots of the tests that -t skips",
    () => {
      const args = ["--ci", "-t", "first", fixture("snapshots.fixture.js")];
      for (const runner of ["jest", "harness"] as const) {
        const result = runJest(runner, args);
        expect(result.numFailedTestSuites).toBe(0);
        expect(result.snapshot.unchecked).toBe(0);
      }
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "removes an obsolete snapshot with -u",
    () => {
      for (const runner of ["jest", "harness"] as const) {
        const directory = fs.mkdtempSync(path.join(FIXTURES, "tmp-"));
        try {
          const spec = writeSpecWithAnObsoleteSnapshot(directory);
          runJest(runner, ["-u", spec]);
          const snapshots = fs.readFileSync(snapshotFileOf(spec), "utf8");
          expect(snapshots).toContain("exports[`first 1`]");
          expect(snapshots).not.toContain("exports[`second 1`]");
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }
    },
    RUN_TIMEOUT_MS,
  );
});

// jest's own runner keeps up to 20 fast files in its own process, where an
// unhandled rejection ends the whole run. Without a cache it has no timings,
// so it uses its workers. The node:test runner gets one worker for each
// project, so that a file that changes shared state runs before the file that
// checks it. jest runs the larger file first.
function runJest(
  runner: Runner,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): JestJson {
  const outputFile = path.join(
    os.tmpdir(),
    `harness-compat-${process.pid}-${runner}-${Date.now()}.json`,
  );
  const runnerArgs =
    runner === "jest"
      ? ["--no-cache", "--maxWorkers=2"]
      : [`--runner=${RUNNER}`, "--maxWorkers=1"];
  const { error } = spawnSync(
    process.execPath,
    [
      JEST,
      "--selectProjects",
      "harness-compat",
      "harness-compat-dom",
      ...runnerArgs,
      ...args,
      "--json",
      `--outputFile=${outputFile}`,
    ],
    {
      cwd: ROOT,
      env: { ...cleanEnvironment(), ...environment },
      // The results come from the output file. The printed output can pass
      // spawnSync's buffer limit.
      stdio: "ignore",
      timeout: RUN_TIMEOUT_MS,
    },
  );
  if (error) {
    throw error;
  }
  try {
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } finally {
    fs.rmSync(outputFile, { force: true });
  }
}

// The run of this spec sets variables for its own workers, such as the time
// limit, which the inner runs must not inherit.
function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { HARNESS_COMPAT: "1" };
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NT_") && !key.startsWith("JEST_")) {
      environment[key] = value;
    }
  }
  return environment;
}

function summarize(result: JestJson): Record<string, FileSummary> {
  return Object.fromEntries(
    result.testResults.map((file) => [
      path.basename(file.name),
      {
        status: file.status,
        tests: Object.fromEntries(
          file.assertionResults.map((test) => [test.fullName, test.status]),
        ),
      },
    ]),
  );
}

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

function writeSpecWithAnObsoleteSnapshot(directory: string): string {
  const spec = path.join(directory, "obsolete-snapshot.fixture.js");
  fs.writeFileSync(
    spec,
    'test("first", () => {\n  expect("first").toMatchSnapshot();\n});\n',
  );
  fs.mkdirSync(path.dirname(snapshotFileOf(spec)));
  fs.copyFileSync(
    path.join(FIXTURES, "__snapshots__/snapshots.fixture.js.snap"),
    snapshotFileOf(spec),
  );
  return spec;
}

function snapshotFileOf(spec: string): string {
  return path.join(
    path.dirname(spec),
    "__snapshots__",
    `${path.basename(spec)}.snap`,
  );
}
