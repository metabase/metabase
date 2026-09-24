import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { plugin as cypressGrepPlugin } from "@cypress/grep/plugin";
import cypressOnFix from "cypress-on-fix";
import installLogsPrinter from "cypress-terminal-report/src/installLogsPrinter";

import { BACKEND_HOST, BACKEND_PORT } from "../runner/constants/backend-port";

import {
  extractFailedTests,
  recordFailedTestsForQuarantine,
  reportFailedTestsToConductor,
} from "./ci_conductor";
import * as ciTasks from "./ci_tasks";
import { collectFailingTests } from "./collectFailedTests";
import {
  copyDirectory,
  readDirectory,
  removeDirectory,
  verifyDownloadTasks,
} from "./commands/downloads/downloadUtils";
import * as dbTasks from "./db_tasks";
import { requestAsAdmin } from "./helpers/e2e-admin-request-tasks";
import {
  startCustomVizDevServer,
  stopCustomVizDevServer,
} from "./helpers/e2e-custom-viz-dev-server-tasks";
import {
  buildDataApp,
  removeDataAppDeclaration,
  removeDataAppPaths,
  scaffoldDataApp,
  syncDataApp,
  writeDataAppFiles,
} from "./helpers/e2e-data-app-tasks";
import { signJwt } from "./helpers/e2e-jwt-tasks";
import {
  startMockLlmServer,
  stopMockLlmServer,
} from "./helpers/e2e-mock-llm-tasks";

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor"); // This function is called when a project is opened or re-opened (e.g. due to the project's config changing)
const coverageTask = require("@cypress/code-coverage/task");
const {
  NodeModulesPolyfillPlugin,
} = require("@esbuild-plugins/node-modules-polyfill");
const cypressSplit = require("cypress-split");

const {
  sideEffectFreeModulesPlugin,
} = require("../../frontend/build/shared/esbuild/side-effect-free-modules-plugin");
const {
  ClassDictionary,
  dumpBackend,
} = require("../coverage/journey-capture-backend");

const isInstrumented = process.env.INSTRUMENT_COVERAGE === "true";

// Journey-capture runs keep raw per-test data in the layout described in e2e/journey-capture/README.md.
const isJourneyCapture =
  isInstrumented && process.env.JOURNEY_CAPTURE === "true";
// "test", "baseline" or "snapshot", set by the workflow for each Cypress run.
const JOURNEY_ROLE = process.env.JOURNEY_CAPTURE_ROLE || "test";
const JOURNEY_ROUND = process.env.JOURNEY_CAPTURE_ROUND || null;
// A second pass over the same tests with different capture settings, kept apart as `tests-<variant>/`.
const JOURNEY_VARIANT = process.env.JOURNEY_CAPTURE_VARIANT || null;
const JOURNEY_KEEP_TEST_EXEC = process.env.JOURNEY_KEEP_TEST_EXEC === "true";
const backendCoveragePort = isJourneyCapture
  ? Number(process.env.JOURNEY_BACKEND_COVERAGE_PORT) || null
  : null;
const JOURNEY_STEP_SNAPSHOTS = isJourneyCapture
  ? process.env.JOURNEY_STEP_SNAPSHOTS || "none"
  : "none";
// The browser asks for a backend dump at every step cut by POSTing here.
const stepDumpPort =
  backendCoveragePort && JOURNEY_STEP_SNAPSHOTS !== "none"
    ? Number(process.env.JOURNEY_STEP_DUMP_PORT) || null
    : null;
const STEP_DUMP_PATH = "/__journey-capture/backend-dump";

// The Cypress config process runs with cwd = this file's directory
// (e2e/support), so @cypress/code-coverage writes .nyc_output/out.json here.
// NYC_OUTPUT_FILE is anchored to __dirname to read from that same place;
// COVERAGE_MANIFEST_RAW_DIR points at e2e/coverage-manifest-raw, which the
// nightly workflow uploads.
const COVERAGE_MANIFEST_RAW_DIR = path.resolve(
  __dirname,
  "../coverage-manifest-raw",
);
const NYC_OUTPUT_FILE = path.resolve(__dirname, ".nyc_output/out.json");
const RAW_DIR = isJourneyCapture
  ? path.resolve(
      process.env.JOURNEY_CAPTURE_DIR ||
        path.resolve(__dirname, "../journey-capture-raw"),
    )
  : COVERAGE_MANIFEST_RAW_DIR;

// Function metadata (name + line per Istanbul function index), accumulated
// across the specs this process runs and shipped with the raw shard artifact.
// The f-counter indices in the per-spec/per-test entries are only meaningful
// against the exact instrumented bundle that produced them; this file makes
// the artifact self-describing for offline analysis (test-overlap heat maps)
// without rebuilding that bundle. Named uniquely per process so shard
// artifacts can merge into one directory without clobbering each other —
// consumers shallow-merge all fnmap-*.json (same file => identical entries).
const FNMAP_FILE = path.join(
  RAW_DIR,
  `fnmap-${require("node:crypto").randomUUID()}.json`,
);

const isEnterprise = process.env["MB_EDITION"] === "ee";
const isCI = !!process.env.CI;

const snowplowMicroUrl = process.env["MB_SNOWPLOW_URL"];

// Per-test capture state, fed by the recordTestCapture task that the
// support-file afterEach calls (e2e/support/per-test-capture.js). Each entry
// is one test attempt: { title, f: {file: {fnIdx: firedCount}}, routes,
// pages }. The function counts arrive already per-test — the support file
// reads them from the app windows' Istanbul counters and zeroes those after
// each flush.
let perTestEntries = [];

// Journey-capture entries also carry `attempt`, `state`, `attemptId`, `events`, `steps`, `capture` and `backend`.
// `backend.beforeTest` holds what the backend ran between the previous test's dump and this test's first root beforeEach,
// `backend.test` what it ran from there to this test's last afterEach.
let pendingBackendBeforeTest = null;
let backendDictionary = null;

// Every dump resets the agent, so dumps run one at a time in request order to keep their windows back to back.
let backendQueue = Promise.resolve();
function enqueueBackendDump(dumpFn) {
  const result = backendQueue.then(dumpFn);
  backendQueue = result.catch(() => {});
  return result;
}

// Journey tasks resolve by this deadline even when a dump hangs, so a stuck agent can't fail a test.
const BACKEND_DEADLINE_MS = 60000;
const STEP_DUMP_WAIT_MS = 10000;

function withDeadline(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback()), ms);
    }),
  ]);
}

// Step dumps requested by the browser, per test attempt, until recordTestCapture collects them.
const stepDumps = new Map();
const collectedAttempts = new Set();
let lateStepDumpRequests = 0;

function stepDumpState(attemptId) {
  let state = stepDumps.get(attemptId);
  if (!state) {
    state = { received: 0, results: [], onReceive: null };
    stepDumps.set(attemptId, state);
  }
  return state;
}

function startStepDumpListener(port) {
  const server = http.createServer((req, res) => {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== STEP_DUMP_PATH) {
      return;
    }
    const attemptId = url.searchParams.get("attempt");
    // A request that arrives after its test was written skips the dump, so its code stays in the agent for the next dump.
    if (collectedAttempts.has(attemptId)) {
      lateStepDumpRequests += 1;
      return;
    }
    const step = Number(url.searchParams.get("step"));
    const seq = Number(url.searchParams.get("seq"));
    const sentAt = Number(url.searchParams.get("sent"));
    const receivedAt = Date.now();
    const state = stepDumpState(attemptId);
    state.received += 1;
    state.onReceive?.();
    enqueueBackendDump(async () => {
      const startedAt = Date.now();
      const record = await dumpBackendNow(
        JOURNEY_KEEP_TEST_EXEC
          ? `backend/exec/${journeyEntryDir()}/steps/${attemptId}/${step}.exec`
          : undefined,
      );
      state.results.push({
        step,
        seq,
        sentAt,
        receivedAt,
        startedAt,
        latencyMs: record.window ? record.window.end - sentAt : null,
        ...record,
      });
    });
  });
  server.on("error", (error) => {
    console.error("[journey-capture] step dump listener failed", error);
  });
  server.listen(port, "127.0.0.1");
  server.unref();
}

// Waits until the browser's step dump requests for this attempt have arrived and run.
async function collectStepDumps(attemptId, expected) {
  const state = stepDumpState(attemptId);
  if (state.received < expected) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, STEP_DUMP_WAIT_MS);
      state.onReceive = () => {
        if (state.received >= expected) {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }
  collectedAttempts.add(attemptId);
  stepDumps.delete(attemptId);
  await backendQueue;
  return state;
}

function journeyEntryDir() {
  if (JOURNEY_ROLE === "baseline") {
    return path.join("baselines", JOURNEY_ROUND || "unknown");
  }
  if (JOURNEY_ROLE === "snapshot") {
    return "snapshots";
  }
  return JOURNEY_VARIANT ? `tests-${JOURNEY_VARIANT}` : "tests";
}

async function dumpBackendNow(execFile) {
  try {
    backendDictionary ??= new ClassDictionary(RAW_DIR);
    return await dumpBackend({
      port: backendCoveragePort,
      rawDir: RAW_DIR,
      dictionary: backendDictionary,
      execFile,
    });
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

function dumpBackendSegment(spec, segment) {
  const keepExec = JOURNEY_ROLE === "baseline" || JOURNEY_KEEP_TEST_EXEC;
  const specDir = String(spec).replace(/[\\/]/g, "__");
  return enqueueBackendDump(() =>
    dumpBackendNow(
      keepExec
        ? `backend/exec/${journeyEntryDir()}/${specDir}/${perTestEntries.length}-${segment}.exec`
        : undefined,
    ),
  );
}

// With step snapshots on, every cut carries the backend dump taken for it, and the final cut gets the test dump.
// `backend.test` is then the union of the cuts, since each cut's dump reset the agent.
function attachStepDumps(steps, stepState, testDump) {
  const cuts = steps.cuts;
  for (const result of stepState?.results ?? []) {
    if (cuts[result.step]) {
      cuts[result.step].backend = result;
    }
  }
  if (cuts.length > 0) {
    cuts[cuts.length - 1].backend = testDump;
  }
  const dumps = cuts.map((cut) => cut.backend).filter((dump) => dump?.window);
  const classes = new Set(dumps.flatMap((dump) => dump.classes));
  return {
    window:
      dumps.length > 0
        ? {
            start: Math.min(...dumps.map((dump) => dump.window.start)),
            end: Math.max(...dumps.map((dump) => dump.window.end)),
          }
        : null,
    classes: [...classes].sort((a, b) => a - b),
    fromSteps: true,
  };
}

async function journeyBackend({ spec, attemptId, capture, steps }, stats) {
  const drainStarted = Date.now();
  const stepState = steps
    ? await collectStepDumps(attemptId, capture?.dumpRequests ?? 0)
    : null;
  stats.drainMs = Date.now() - drainStarted;
  stats.stepDumpsReceived = stepState?.received ?? 0;
  const testDump = await dumpBackendSegment(spec, "test");
  return {
    beforeTest: pendingBackendBeforeTest,
    test: steps ? attachStepDumps(steps, stepState, testDump) : testDump,
  };
}

async function recordJourneyTest({
  spec,
  attempt,
  state,
  events,
  durationMs,
  attemptId,
  capture,
  steps,
  ...rest
}) {
  const stats = { ...capture, lateStepDumpRequests };
  lateStepDumpRequests = 0;
  let backend;
  if (backendCoveragePort) {
    try {
      backend = await withDeadline(
        journeyBackend({ spec, attemptId, capture, steps }, stats),
        BACKEND_DEADLINE_MS,
        () => ({ error: "backend dumps timed out" }),
      );
    } catch (error) {
      backend = { error: String(error?.message ?? error) };
    }
  }
  pendingBackendBeforeTest = null;
  perTestEntries.push({
    ...rest,
    attempt,
    state,
    attemptId,
    durationMs,
    capture: stats,
    events,
    steps: steps ? { mode: JOURNEY_STEP_SNAPSHOTS, ...steps } : undefined,
    backend,
  });
  return null;
}

const perTestCaptureTasks = {
  recordTestCapture({ title, f, routes, pages, ...journey }) {
    if (isJourneyCapture) {
      return recordJourneyTest({ title, f, routes, pages, ...journey });
    }
    perTestEntries.push({ title, f, routes, pages });
    return null;
  },

  async resetBackendCoverage({ spec }) {
    if (backendCoveragePort) {
      pendingBackendBeforeTest = await withDeadline(
        dumpBackendSegment(spec, "before-test"),
        BACKEND_DEADLINE_MS,
        () => ({ error: "backend dump timed out" }),
      );
    }
    return null;
  },

  resetTestCapture() {
    perTestEntries = [];
    return null;
  },
};

// Records name + line for every instrumented function in files this process
// hasn't seen yet. The metadata is identical for a given file across specs
// (same bundle), so first sighting wins.
function appendFnMap(coverage) {
  let fnMap = {};
  try {
    fnMap = JSON.parse(fs.readFileSync(FNMAP_FILE, "utf8"));
  } catch {
    // First spec of the run.
  }
  let changed = false;
  for (const [file, fileCov] of Object.entries(coverage)) {
    if (fnMap[file] || !fileCov.fnMap) {
      continue;
    }
    const entry = {};
    for (const [idx, fn] of Object.entries(fileCov.fnMap)) {
      entry[idx] = {
        name: fn.name,
        line: fn.decl?.start?.line ?? fn.loc?.start?.line ?? null,
        // The release cljs output puts a whole namespace on a few lines, so its functions differ only by column.
        ...(isJourneyCapture && {
          column: fn.decl?.start?.column ?? fn.loc?.start?.column ?? null,
        }),
      };
    }
    fnMap[file] = entry;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(FNMAP_FILE, JSON.stringify(fnMap));
  }
}

function writeJourneyEntry(spec, coverage, tests) {
  const dir = path.join(RAW_DIR, journeyEntryDir());
  fs.mkdirSync(dir, { recursive: true });
  const entry = {
    kind: JOURNEY_ROLE,
    ...(JOURNEY_ROLE === "baseline" && {
      baseline: {
        name: path.basename(spec.relative).replace(/\.cy\..*$/, ""),
        round: JOURNEY_ROUND,
      },
    }),
    ...(JOURNEY_VARIANT && { variant: JOURNEY_VARIANT }),
    stepSnapshots: JOURNEY_STEP_SNAPSHOTS,
    spec: spec.relative,
    coverage,
    tests,
  };
  const entryName = spec.relative.replace(/[\\/]/g, "__") + ".json";
  fs.writeFileSync(path.join(dir, entryName), JSON.stringify(entry));
}

// Persists raw __coverage__ counters per spec, plus the per-test breakdown
// (function deltas and API routes). The manifest builder reads these later,
// applies baseline subtraction, and maps surviving files to modules. We
// delete .nyc_output/out.json between specs so each entry reflects only that
// spec's execution — @cypress/code-coverage otherwise accumulates.
function writeSpecCoverageEntry(spec) {
  // Consume the per-test state up front so a missing/corrupt out.json can't
  // leak one spec's tests into the next spec's entry.
  const tests = perTestEntries;
  perTestEntries = [];

  if (!fs.existsSync(NYC_OUTPUT_FILE)) {
    // Journey-capture tests still carry events and backend coverage without any FE coverage.
    if (isJourneyCapture) {
      writeJourneyEntry(spec, {}, tests);
    }
    return;
  }

  const coverage = JSON.parse(fs.readFileSync(NYC_OUTPUT_FILE, "utf8"));

  fs.mkdirSync(RAW_DIR, { recursive: true });
  appendFnMap(coverage);

  // The manifest builder only needs per-file function counters to compute the
  // baseline greater-delta. Drop statement/branch maps and counters, and drop
  // files where no function was invoked. Cuts each entry from ~25MB to <200KB.
  const trimmed = {};
  for (const [file, fc] of Object.entries(coverage)) {
    if (!Object.values(fc.f || {}).some((c) => c > 0)) {
      continue;
    }
    trimmed[file] = { f: fc.f };
  }

  if (isJourneyCapture) {
    writeJourneyEntry(spec, trimmed, tests);
  } else {
    fs.mkdirSync(COVERAGE_MANIFEST_RAW_DIR, { recursive: true });
    const entryName = spec.relative.replace(/[\\/]/g, "__") + ".json";
    fs.writeFileSync(
      path.join(COVERAGE_MANIFEST_RAW_DIR, entryName),
      JSON.stringify({ spec: spec.relative, coverage: trimmed, tests }),
    );
  }

  fs.unlinkSync(NYC_OUTPUT_FILE);
}

// docs say that tsconfig paths should handle aliases, but they don't
const assetsResolverPlugin = {
  name: "assetsResolver",
  setup(build) {
    // Redirect all paths starting with "assets/" to "resources/"
    build.onResolve({ filter: /^assets\// }, (args) => {
      return {
        path: path.join(
          __dirname,
          "../../resources/frontend_client/app",
          args.path,
        ),
      };
    });
  },
};

const defaultConfig = {
  // Expose non-sensitive environment variables synchronously via Cypress.expose()
  // These are safe to expose in the browser and are used for configuration
  expose: {
    CI: isCI,
    IS_ENTERPRISE: isEnterprise,
    MB_EDITION: process.env["MB_EDITION"],
    ENABLE_NETWORK_THROTTLING: !!process.env["ENABLE_NETWORK_THROTTLING"],
    SNOWPLOW_MICRO_URL: snowplowMicroUrl,
    CLIENT_PORT: process.env["CLIENT_PORT"],
    feHealthcheck: process.env["FE_HEALTHCHECK_URL"]
      ? { enabled: true, url: process.env["FE_HEALTHCHECK_URL"] }
      : undefined,
    // Lets @cypress/code-coverage/support skip its hooks entirely on
    // uninstrumented runs, instead of logging a warning on every spec.
    coverage: isInstrumented,
    journeyCapture: isJourneyCapture,
    backendCoverage: backendCoveragePort != null,
    stepSnapshots: JOURNEY_STEP_SNAPSHOTS,
    stepDumpUrl: stepDumpPort
      ? `http://127.0.0.1:${stepDumpPort}${STEP_DUMP_PATH}`
      : null,
  },

  allowCypressEnv: false,

  // This is the functionality of the old cypress-plugins.js file
  setupNodeEvents(cypressOn, config) {
    // `on` is used to hook into various events Cypress emits
    // `config` is the resolved Cypress config

    // Build custom-viz .tgz fixtures from sources
    execFileSync(
      "node",
      [
        path.resolve(
          __dirname,
          "../../enterprise/frontend/src/custom-viz/fixtures/build-example-custom-viz.mjs",
        ),
      ],
      { stdio: "inherit" },
    );

    // Use cypress-on-fix to enable multiple handlers
    const on = cypressOnFix(cypressOn);

    // CLI grep can't handle commas in the name
    // needed when we want to run only specific tests
    config.expose.grep ??= process.env.GREP;

    // cypress-terminal-report
    if (isCI) {
      installLogsPrinter(on, {
        printLogsToConsole: "never",
      });
    }

    /********************************************************************
     **                        PREPROCESSOR                            **
     ********************************************************************/
    on(
      "file:preprocessor",
      createBundler({
        loader: {
          ".svg": "text",
        },
        plugins: [
          NodeModulesPolyfillPlugin(),
          assetsResolverPlugin,
          sideEffectFreeModulesPlugin,
        ],
        sourcemap: "inline",
      }),
    );

    /********************************************************************
     **                         BROWSERS                               **
     ********************************************************************/

    on("before:browser:launch", (browser = {}, launchOptions) => {
      if (browser.name === "chrome" || browser.name === "chromium") {
        // Open dev tools in Chrome by default when in headed mode
        if (browser.isHeaded) {
          launchOptions.args.push("--auto-open-devtools-for-tabs");
        }
        launchOptions.args.push("--blink-settings=preferredColorScheme=1");
      }

      // Start browsers with prefers-reduced-motion set to "reduce"
      if (browser.family === "firefox") {
        launchOptions.preferences["ui.prefersReducedMotion"] = 1;
      }

      if (browser.family === "chromium") {
        launchOptions.args.push("--force-prefers-reduced-motion");
      }

      return launchOptions;
    });

    /********************************************************************
     **                           TASKS                                **
     ********************************************************************/
    on("task", {
      log(...messages) {
        console.log(...messages);
        return null; // tasks must have a return value
      },
      ...dbTasks,
      ...ciTasks,
      ...verifyDownloadTasks,
      readDirectory,
      copyDirectory,
      removeDirectory,
      signJwt,
      requestAsAdmin,
      startMockLlmServer,
      stopMockLlmServer,
      startCustomVizDevServer,
      stopCustomVizDevServer,
      buildDataApp,
      syncDataApp,
      scaffoldDataApp,
      writeDataAppFiles,
      removeDataAppDeclaration,
      removeDataAppPaths,
      ...perTestCaptureTasks,
    });

    /********************************************************************
     **                          CONFIG                                **
     ********************************************************************/

    // `grepIntegrationFolder` needs to point to the root!
    // See: https://github.com/cypress-io/cypress/issues/24452#issuecomment-1295377775
    config.expose.grepIntegrationFolder = "../../";
    config.expose.grepFilterSpecs = true;
    config.expose.grepOmitFiltered = true;

    cypressGrepPlugin(config);

    if (isCI) {
      cypressSplit(on, config);
      collectFailingTests(on, config);
    }

    if (isInstrumented) {
      coverageTask(on, config);
    }

    if (stepDumpPort) {
      startStepDumpListener(stepDumpPort);
    }

    // Surface the resolved Cypress retry ceiling so the ci-conductor reporter
    // can include it in the payload (CYPRESS_RETRIES isn't otherwise set in CI;
    // the value lives in mainConfig.retries.runMode). DEV-1999.
    const resolvedRetries =
      typeof config.retries === "number"
        ? config.retries
        : (config.retries?.runMode ?? 0);
    process.env.CYPRESS_RETRIES = String(resolvedRetries);

    on("after:spec", async (spec, results) => {
      // Report failures to ci-conductor mid-run (no-ops unless configured).
      if (isCI) {
        // Reporting to ci-conductor must NEVER break the test run, so this is
        // a hard backstop around everything — extraction, payload build, and
        // the request. The reporter also handles its own errors internally.
        try {
          const failedTests = extractFailedTests(spec, results);
          // Persist ultimate failures for the post-run quarantine gate (DEV-2082).
          recordFailedTestsForQuarantine(failedTests);
          await reportFailedTestsToConductor(failedTests);
        } catch (error) {
          console.error("[ci-conductor] reporting failed (ignored)", error);
        }
      }

      // this is an official workaround to keep recordings of the failed specs only
      // https://docs.cypress.io/guides/guides/screenshots-and-videos#Delete-videos-for-specs-without-failing-or-retried-tests
      if (results && results.video) {
        // Do we have test failures?
        if (results && results.video && results.stats.failures === 0) {
          // delete the video if the spec passed
          fs.unlinkSync(results.video);
        }
      }

      if (isInstrumented) {
        // Don't let a bad/partial coverage file abort the nightly shard - at
        // worst we lose this spec's entry, not the whole run.
        try {
          writeSpecCoverageEntry(spec);
        } catch (error) {
          console.error(
            "[coverage] failed to write spec entry (ignored)",
            error,
          );
        }
      }
    });

    return config;
  },
  baseUrl: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
  defaultBrowser: process.env.CYPRESS_BROWSER ?? "chrome",
  supportFile: "e2e/support/cypress.js",
  chromeWebSecurity: false,
  modifyObstructiveCode: false,
  // New `specPattern` is the combination of the old:
  //   1. testFiles and
  //   2. integrationFolder
  specPattern: "e2e/test/**/*.cy.spec.{js,ts}",
  viewportHeight: 800,
  viewportWidth: 1280,
  // enable video recording in run mode
  video: process.env["CYPRESS_VIDEO"] !== "false",
  videoCompression: false,
};

const mainConfig = {
  ...defaultConfig,
  numTestsKeptInMemory: process.env["CI"] ? 1 : 50,
  reporter: "cypress-multi-reporters",
  reporterOptions: {
    configFile: false,
    // 🤯 mochawesome != cypress-mochawesome-reporter != mochaAwesome (this form does not exist) 🤯
    // See https://glebbahmutov.com/blog/the-awesome-battle/ to compare the first two.
    reporterEnabled: "mochawesome, mocha-junit-reporter",
    mochawesomeReporterOptions: {
      // https://github.com/adamgruber/mochawesome (NOT https://www.npmjs.com/package/cypress-mochawesome-reporter)
      reportDir: "cypress/reports/mochareports",
      reportFilename: "[status]-[name]",
      quiet: true,
      html: true,
      json: true,
    },
    // 🤯🤮mochaJunitReporterReporterOptions 🤮🤯
    // Exercise care when using this poorly documented key:
    // - https://stackoverflow.com/questions/51180963/cypress-tests-with-mocha-multi-reports-not-able-to-get-aggregated-results-for-a
    // - https://stackoverflow.com/questions/37965049/mocha-multi-reporter-with-junit
    // For the curious, ChatGPT 3.5 does NOT get it right
    mochaJunitReporterReporterOptions: {
      mochaFile: "./target/junit/[hash].xml",
      toConsole: false,
    },
  },
  retries: {
    runMode:
      process.env["CYPRESS_RETRIES"] != null
        ? parseInt(process.env["CYPRESS_RETRIES"], 10)
        : 1,
    openMode: 0,
  },
};

module.exports = {
  defaultConfig,
  mainConfig,
};
