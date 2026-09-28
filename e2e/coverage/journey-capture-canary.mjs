/**
 * Runs the journey capture on the specs that send the license tokens, with a fake token (a canary) in each token variable.
 * Then it looks for the canaries in the output as the capture wrote it, and in a scrubbed copy.
 * The prerequisites are in the "Canary check" section of e2e/journey-capture/README.md.
 *
 *   node e2e/coverage/journey-capture-canary.mjs
 *
 * It prints only counts, file names, rules and canary labels, never a value.
 * It exits with 1 when the scrubbed copy still holds anything the verify step rejects or a spec didn't record its token routes,
 * and with 2 when a prerequisite is missing or the environment would let a real token into the run.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import {
  RULES,
  TOKEN_RULES,
  parseSecrets,
  scrubDir,
  verifyDir,
} from "./journey-capture-scrub.mjs";
import { SCHEMA, SCHEMA_VERSIONS } from "./journey-capture.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SETUP_SPEC = "e2e/test/scenarios/onboarding/setup/setup.cy.spec.ts";
const SAVED_SPEC = "e2e/test/scenarios/question/saved.cy.spec.js";
const SNAPSHOT_CREATOR = "e2e/snapshot-creators/default.cy.snap.js";
const GREP_TAGS = "-@mongo+-@python+-@OSS";
const TOKEN_SETTING_PATH = "/api/setting/premium-embedding-token";
const MAX_LISTED = 20;

const SNAPSHOTS = ["blank", "setup", "without_models", "default"];
const INSTANCE_FILES = [
  "e2e/support/cypress_sample_instance_data.json",
  "e2e/support/cypress_sample_database.json",
];

/**
 * A fake license token: 64 lowercase hex digits like a real one, starting with "fa4e" and derived from `label`.
 */
export function canaryToken(label) {
  const digest = createHash("sha256")
    .update(`journey-capture-canary ${label}`)
    .digest("hex");
  return `fa4e${digest.slice(0, 60)}`;
}

// The token helpers and the setup spec read these through cy.env(), which Cypress fills from the CYPRESS_ variables.
export const CANARIES = [
  ["all-features", "CYPRESS_MB_ALL_FEATURES_TOKEN"],
  ["starter-cloud", "CYPRESS_MB_STARTER_CLOUD_TOKEN"],
  ["pro-cloud", "CYPRESS_MB_PRO_CLOUD_TOKEN"],
  ["pro-self-hosted", "CYPRESS_MB_PRO_SELF_HOSTED_TOKEN"],
].map(([label, variable]) => ({ label, variable, value: canaryToken(label) }));

/**
 * The canaries as the scrub's secrets, each named by its label.
 */
export function canarySecrets() {
  return parseSecrets(
    JSON.stringify(
      Object.fromEntries(CANARIES.map(({ label, value }) => [label, value])),
    ),
  ).secrets;
}

const SECRET_NAME =
  /TOKEN|SECRET|PASSW(?:OR)?D|API_?KEY|PRIVATE|CREDENTIAL|(?:^|_)KEY(?:_|$)/i;
const RUN_CONTROL =
  /^(?:CI|GREP|SPEC|SPLIT(?:_\w+)?|JOURNEY_\w+|INSTRUMENT_\w+|CYPRESS_(?!(?:BROWSER|CACHE_FOLDER|RUN_BINARY)$)\w+)$/;

function isTokenShaped(value) {
  return TOKEN_RULES.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

/**
 * The environment of a Cypress run: `base` without the variables named or shaped like a secret,
 * or that change which tests run and what the capture records, then the canaries and `settings`.
 */
export function runEnv(base, settings = {}) {
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    if (
      typeof value === "string" &&
      !SECRET_NAME.test(name) &&
      !RUN_CONTROL.test(name) &&
      !isTokenShaped(value)
    ) {
      env[name] = value;
    }
  }
  for (const { variable, value } of CANARIES) {
    env[variable] = value;
  }
  return { ...env, ...settings };
}

/**
 * The names of the variables in `env` that would let something other than a canary into a run:
 * a token variable that doesn't hold its canary, and any other variable named or shaped like a secret.
 */
export function unsafeVariables(env) {
  const canaries = new Map(
    CANARIES.map(({ variable, value }) => [variable, value]),
  );
  const unsafe = [...canaries]
    .filter(([variable, value]) => env[variable] !== value)
    .map(([variable]) => variable);
  for (const [name, value] of Object.entries(env)) {
    if (
      !canaries.has(name) &&
      (SECRET_NAME.test(name) || isTokenShaped(String(value)))
    ) {
      unsafe.push(name);
    }
  }
  return unsafe;
}

const activateTokenRoutes = [
  {
    route: "the cy.request of H.activateToken",
    reached: (event) =>
      event.kind === "request" &&
      event.initiator === "cy.request" &&
      event.method === "PUT" &&
      event.path === TOKEN_SETTING_PATH,
  },
  {
    route: "the .then chained on that cy.request",
    reached: (event) =>
      event.kind === "command" &&
      event.name === "then" &&
      String(event.chain).startsWith(`request(PUT ${TOKEN_SETTING_PATH})`),
  },
];

/**
 * The specs the check runs, the directory the capture writes each one to,
 * and the events that show each token route ran.
 */
export const CAPTURED_SPECS = [
  {
    spec: SETUP_SPEC,
    dir: "tests",
    routes: [
      {
        route: "the token typed into the license form",
        reached: (event) =>
          event.kind === "command" &&
          event.name === "type" &&
          String(event.chain).includes('findByLabelText("Token")'),
      },
      {
        route: "the license form's request",
        reached: (event) =>
          event.kind === "request" &&
          event.initiator !== "cy.request" &&
          event.method === "PUT" &&
          event.path === TOKEN_SETTING_PATH,
      },
    ],
  },
  { spec: SAVED_SPEC, dir: "tests", routes: activateTokenRoutes },
  { spec: SNAPSHOT_CREATOR, dir: "snapshots", routes: activateTokenRoutes },
];

function readTests(file) {
  try {
    const { tests } = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(tests) ? tests : null;
  } catch {
    return null;
  }
}

/**
 * For each spec, whether the capture wrote its entry, how many attempts and request events it holds,
 * and which token routes ran.
 */
export function checkCaptureData(rawDir, specs = CAPTURED_SPECS) {
  return specs.map(({ spec, dir, routes }) => {
    const file = path.join(dir, `${spec.replace(/[\\/]/g, "__")}.json`);
    const tests = readTests(path.join(rawDir, file));
    const events = (tests ?? []).flatMap((test) => test.events ?? []);
    const requests = events.filter(({ kind }) => kind === "request").length;
    const reached = routes
      .filter(({ reached }) => events.some(reached))
      .map(({ route }) => route);
    const missed = routes
      .map(({ route }) => route)
      .filter((route) => !reached.includes(route));
    return {
      spec,
      file,
      written: tests !== null,
      attempts: tests?.length ?? 0,
      requests,
      reached,
      missed,
      ok: tests !== null && requests > 0 && missed.length === 0,
    };
  });
}

/**
 * What verifyDir finds in `dir`, plus the files that hold each canary.
 * verifyDir names one secret per file, so each canary gets a pass of its own.
 */
export function scanDir(dir, secrets) {
  const verified = verifyDir(dir, secrets);
  const labels = [...new Set(secrets.map(({ name }) => name))];
  const canaryFiles = Object.fromEntries(
    labels.map((label) => [
      label,
      verifyDir(
        dir,
        secrets.filter(({ name }) => name === label),
      )
        .leftovers.filter(({ rule }) => rule === "secret")
        .map(({ file }) => file),
    ]),
  );
  return { ...verified, canaryFiles };
}

/**
 * Copies `rawDir` to `copyDir`, scrubs the copy as the workflow scrubs a shard, and scans it.
 */
export function scrubCopy(rawDir, copyDir, secrets) {
  fs.cpSync(rawDir, copyDir, { recursive: true, verbatimSymlinks: true });
  const scrubbed = scrubDir(copyDir, secrets);
  return { scrubbed, scan: scanDir(copyDir, secrets) };
}

/**
 * Why the check fails: anything left in the scrubbed copy,
 * and every spec without data or with a token route that didn't run.
 */
export function failures({ data, after }) {
  const reasons = [];
  if (!after.ok) {
    reasons.push(
      `the workflow's verify step would reject the scrubbed copy (leftovers: ${after.leftovers.length})`,
    );
  }
  for (const { spec, written, requests, missed } of data) {
    if (!written) {
      reasons.push(`${spec} left no readable entry`);
    } else if (requests === 0) {
      reasons.push(`${spec} recorded no request events`);
    }
    for (const route of missed) {
      reasons.push(`${spec} never ran ${route}`);
    }
  }
  return reasons;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => `${name} ${count}`).join(", ");
}

function scanLines(title, scan) {
  const lines = [
    `${title}: ${scan.files} files checked, ${scan.leftovers.length} leftovers`,
    `  canaries: ${Object.entries(scan.canaryFiles)
      .map(([label, files]) => `${label} in ${files.length} files`)
      .join(", ")}`,
  ];
  if (scan.leftovers.length > 0) {
    lines.push(`  rules: ${countBy(scan.leftovers, ({ rule }) => rule)}`);
  }
  const listed = [
    ...Object.entries(scan.canaryFiles).flatMap(([label, files]) =>
      files.map((file) => `${file}: secret (${label})`),
    ),
    ...scan.leftovers
      .filter(({ rule }) => rule !== "secret")
      .map(({ file, rule }) => `${file}: ${rule}`),
  ];
  for (const line of listed.slice(0, MAX_LISTED)) {
    lines.push(`  ${line}`);
  }
  if (listed.length > MAX_LISTED) {
    lines.push(`  ... and ${listed.length - MAX_LISTED} more`);
  }
  return lines;
}

/**
 * The report's text, and whether the check passed.
 */
export function report({ runs = [], summary, data, before, scrubbed, after }) {
  const lines = [
    `canaries: ${CANARIES.map(({ label, variable }) => `${label} in ${variable}`).join(", ")}`,
    ...runs.map(({ name, outcome }) => `cypress ${name}: ${outcome}`),
    ...(summary ? [`summary.txt: ${summary}`] : []),
    "capture data:",
  ];
  for (const spec of data) {
    lines.push(
      spec.written
        ? `  ${spec.spec}: ${spec.attempts} attempts, ${spec.requests} request events in ${spec.file}`
        : `  ${spec.spec}: no readable entry at ${spec.file}`,
    );
    for (const route of spec.reached) {
      lines.push(`    ran ${route}`);
    }
    for (const route of spec.missed) {
      lines.push(`    DID NOT RUN ${route}`);
    }
  }
  lines.push(...scanLines("before the scrub, for information", before));
  lines.push(
    `scrub: ${scrubbed.files} files, ${scrubbed.changedFiles} changed, ` +
      `replacements: ${RULES.map((rule) => `${rule} ${scrubbed.counts[rule]}`).join(", ")}`,
  );
  lines.push(...scanLines("after the scrub", after));
  const reasons = failures({ data, after });
  lines.push(`result: ${reasons.length === 0 ? "PASS" : "FAIL"}`);
  for (const reason of reasons) {
    lines.push(`  ${reason}`);
  }
  return { text: lines.join("\n"), pass: reasons.length === 0 };
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Istanbul keeps its counters in this global, so every instrumented module names it.
const COVERAGE_GLOBAL = "__coverage__";

async function bodyIncludes(url, marker) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) {
    return false;
  }
  const decoder = new TextDecoder();
  let tail = "";
  for await (const chunk of response.body) {
    const text = tail + decoder.decode(chunk, { stream: true });
    if (text.includes(marker)) {
      return true;
    }
    tail = text.slice(-marker.length);
  }
  return false;
}

// The page the backend serves loads the frontend, from the dev server in hot mode and from the backend otherwise.
async function servesInstrumentedFrontend(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/`, {
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();
    const scripts = [
      ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g),
    ].map(([, src]) => new URL(src, `${baseUrl}/`).href);
    for (const script of scripts) {
      if (await bodyIncludes(script, COVERAGE_GLOBAL)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// The backend writes e2e/snapshots under its working directory, which lsof reads from the process listening on the port.
function backendWorkingDir(port) {
  try {
    const [pid] = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    ).split("\n");
    const fields = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
      encoding: "utf8",
    });
    return (
      fields
        .split("\n")
        .find((line) => line.startsWith("n"))
        ?.slice(1) ?? null
    );
  } catch {
    return null;
  }
}

async function missingPrerequisites(baseUrl, backendDir) {
  const missing = [];
  if (fs.existsSync(path.join(REPO_ROOT, "cypress.env.json"))) {
    missing.push(
      "cypress.env.json is in the repository root. Cypress loads it into cy.env(), where it can hand the specs a real token, so move it aside while the check runs.",
    );
  }
  if (!(await answers(`${baseUrl}/api/health`))) {
    missing.push(
      `No Metabase backend answers on ${baseUrl}. Start an EE backend for e2e, for example with node e2e/runner/start-backend.js.`,
    );
    return missing;
  }
  if (!(await answers(`${baseUrl}/api/testing/echo?body=%7B%7D`))) {
    missing.push(
      "The backend has no /api/testing endpoints. Start it in e2e mode, as e2e/runner/start-backend.js does.",
    );
  }
  if (!backendDir) {
    missing.push(
      "lsof couldn't find the working directory of the backend, which is where it keeps e2e/snapshots.",
    );
  } else {
    for (const name of ["blank", "default"]) {
      if (
        !fs.existsSync(path.join(backendDir, "e2e", "snapshots", `${name}.sql`))
      ) {
        missing.push(
          `The backend has no ${name} snapshot in ${path.join(backendDir, "e2e", "snapshots")}. Generate the snapshots with a normal local run, such as bun run test-cypress.`,
        );
      }
    }
  }
  for (const file of INSTANCE_FILES) {
    if (!fs.existsSync(path.join(REPO_ROOT, file))) {
      missing.push(
        `${file} is missing. The snapshot creator writes it in a normal local run, such as bun run test-cypress.`,
      );
    }
  }
  if (!(await servesInstrumentedFrontend(baseUrl))) {
    missing.push(
      "The frontend isn't instrumented. Start the dev server with INSTRUMENT_COVERAGE=true bun run build-hot, or build it with INSTRUMENT_COVERAGE=true bun run build-release:js.",
    );
  }
  return missing;
}

function backUp(files, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  return files.map((file, index) => {
    const copy = path.join(backupDir, `${index}-${path.basename(file)}`);
    const existed = fs.existsSync(file);
    if (existed) {
      fs.copyFileSync(file, copy);
    }
    return { file, copy, existed };
  });
}

function putBack(backups) {
  for (const { file, copy, existed } of backups) {
    if (existed) {
      fs.copyFileSync(copy, file);
    } else {
      fs.rmSync(file, { force: true });
    }
  }
}

async function restoreBlankSnapshot(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/testing/restore/blank`, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

let running = null;

function runCypress(args, env) {
  return new Promise((resolve) => {
    running = spawn(
      process.execPath,
      ["e2e/runner/run_cypress_ci.js", ...args],
      { cwd: REPO_ROOT, env, stdio: "inherit" },
    );
    running.on("error", () => resolve("failed to start"));
    running.on("exit", (code, signal) => {
      running = null;
      resolve(`exited with ${code ?? signal}`);
    });
  });
}

// The workflow writes meta.json and the reader's summary.txt before the scrub, so the check scans them too.
function writeMetaAndSummary(rawDir, runs) {
  fs.writeFileSync(
    path.join(rawDir, "meta.json"),
    JSON.stringify({
      schema: SCHEMA,
      schemaVersion: SCHEMA_VERSIONS.at(-1),
      event: "local-canary-check",
      shard: { index: 0, count: 1 },
      inputs: null,
      effective: {
        spec: [SETUP_SPEC, SAVED_SPEC].join(","),
        edition: "ee",
        grepTags: GREP_TAGS,
      },
      capture: {
        events: true,
        stepSnapshots: "assertions",
        backend: null,
      },
      outcomes: Object.fromEntries(
        runs.map(({ name, outcome }) => [name, outcome]),
      ),
    }),
  );
  const summary = spawnSync(
    process.execPath,
    ["e2e/coverage/journey-capture.mjs", rawDir, "--subtract"],
    {
      cwd: REPO_ROOT,
      env: runEnv(process.env),
      encoding: "utf8",
      maxBuffer: 1 << 28,
    },
  );
  fs.writeFileSync(path.join(rawDir, "summary.txt"), summary.stdout ?? "");
  return summary.status === 0
    ? "written"
    : `reader exited with ${summary.status}`;
}

async function main() {
  const baseUrl = `http://${process.env.MB_JETTY_HOST || "localhost"}:${
    process.env.MB_JETTY_PORT || process.env.BACKEND_PORT || 4000
  }`;
  const backendDir = backendWorkingDir(new URL(baseUrl).port);
  const missing = await missingPrerequisites(baseUrl, backendDir);
  if (missing.length > 0) {
    console.error(
      [
        "The canary check can't run:",
        ...missing.map((line) => `- ${line}`),
      ].join("\n"),
    );
    return 2;
  }

  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "journey-capture-canary-"),
  );
  const rawDir = path.join(workDir, "raw");
  fs.mkdirSync(rawDir);
  const settings = (role, stepSnapshots) => ({
    MB_EDITION: "ee",
    INSTRUMENT_COVERAGE: "true",
    JOURNEY_CAPTURE: "true",
    JOURNEY_CAPTURE_DIR: rawDir,
    JOURNEY_CAPTURE_ROLE: role,
    JOURNEY_STEP_SNAPSHOTS: stepSnapshots,
    CYPRESS_GUI: "false",
    CYPRESS_VIDEO: "false",
  });
  // The workflow cuts only the shard's tests into steps and runs the snapshot creators without step snapshots.
  const runs = [
    {
      name: "tests",
      args: [
        "e2e",
        "--spec",
        [SETUP_SPEC, SAVED_SPEC].join(","),
        "--expose",
        `grepTags=${GREP_TAGS}`,
      ],
      env: runEnv(process.env, settings("test", "assertions")),
    },
    {
      name: "snapshot creator",
      args: ["snapshot", "--spec", SNAPSHOT_CREATOR],
      env: runEnv(process.env, settings("snapshot", "none")),
      // The creator's first step saves the app DB as the blank snapshot,
      // and its setup only works on an instance that isn't set up.
      before: () => restoreBlankSnapshot(baseUrl),
    },
  ];
  for (const run of runs) {
    const unsafe = unsafeVariables(run.env);
    if (unsafe.length > 0) {
      console.error(
        `Refusing to run the ${run.name}: ${unsafe.join(", ")} would let something other than a canary into it.`,
      );
      fs.rmSync(workDir, { recursive: true, force: true });
      return 2;
    }
  }

  console.log(`canary check output: ${workDir}`);
  // The snapshot creator rewrites the snapshots,
  // and with a canary it fails before it writes the instance data that goes with them.
  // The instance data holds the sessions saved in the snapshots, so both are put back when the runs end.
  const backups = backUp(
    [
      ...SNAPSHOTS.map((name) =>
        path.join(backendDir, "e2e", "snapshots", `${name}.sql`),
      ),
      ...INSTANCE_FILES.map((file) => path.join(REPO_ROOT, file)),
    ],
    path.join(workDir, "backup"),
  );
  const onSignal = (signal) => {
    running?.kill(signal);
    putBack(backups);
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    for (const run of runs) {
      if (run.before && !(await run.before())) {
        run.outcome = "not run, the blank snapshot couldn't be restored";
        continue;
      }
      run.outcome = await runCypress(run.args, run.env);
    }
  } finally {
    putBack(backups);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  fs.rmSync(path.join(workDir, "backup"), { recursive: true, force: true });

  const summary = writeMetaAndSummary(rawDir, runs);
  const secrets = canarySecrets();
  const data = checkCaptureData(rawDir);
  const before = scanDir(rawDir, secrets);
  const { scrubbed, scan: after } = scrubCopy(
    rawDir,
    path.join(workDir, "scrubbed"),
    secrets,
  );
  const { text, pass } = report({
    runs,
    summary,
    data,
    before,
    scrubbed,
    after,
  });
  console.log(text);
  console.log(
    `capture output: ${rawDir}, scrubbed copy: ${path.join(workDir, "scrubbed")}`,
  );
  return pass ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(2);
    },
  );
}
