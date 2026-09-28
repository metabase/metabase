import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CANARIES,
  canarySecrets,
  canaryToken,
  checkCaptureData,
  report,
  runEnv,
  scanDir,
  scrubCopy,
  unsafeVariables,
} from "./journey-capture-canary.mjs";
import { FRAGMENT_LENGTH, secretForms } from "./journey-capture-scrub.mjs";

const [ALL_FEATURES, STARTER_CLOUD, PRO_CLOUD, PRO_SELF_HOSTED] = CANARIES;
const SECRETS = canarySecrets();

// Hex of the license-token shape that is not a canary, standing in for a real token in the environment.
const NOT_A_CANARY = "0123456789abcdef".repeat(4);

const SETUP_SPEC = "e2e/test/scenarios/onboarding/setup/setup.cy.spec.ts";
const SAVED_SPEC = "e2e/test/scenarios/question/saved.cy.spec.js";
const SNAPSHOT_CREATOR = "e2e/snapshot-creators/default.cy.snap.js";
const SETUP_ENTRY =
  "tests/e2e__test__scenarios__onboarding__setup__setup.cy.spec.ts.json";
const SAVED_ENTRY =
  "tests/e2e__test__scenarios__question__saved.cy.spec.js.json";
const CREATOR_ENTRY =
  "snapshots/e2e__snapshot-creators__default.cy.snap.js.json";
const TOKEN_SETTING_PATH = "/api/setting/premium-embedding-token";

// The events per-test-capture.js records for each token route, after the config process has masked the whole tokens.
function activateTokenEvents(chainerId) {
  return [
    {
      seq: 0,
      kind: "request",
      initiator: "cy.request",
      method: "PUT",
      path: TOKEN_SETTING_PATH,
      chainerId,
      body: '{"value":"<masked>"}',
      bodyHash: "0123456789abcdef",
      bodyBytes: 76,
    },
    {
      seq: 1,
      kind: "command",
      name: "then",
      chainerId,
      chain: `request(PUT ${TOKEN_SETTING_PATH}).then(fn)`,
    },
  ];
}

function setupEvents() {
  return [
    {
      seq: 0,
      kind: "command",
      name: "type",
      chainerId: "ch-type",
      chain:
        'findByLabelText("Token").invoke("attr", "type", "password").type(<hidden>, <hidden>)',
    },
    {
      seq: 1,
      kind: "request",
      initiator: "proxy:fetch",
      method: "PUT",
      path: TOKEN_SETTING_PATH,
      bodyHash: "fedcba9876543210",
      bodyBytes: 76,
    },
  ];
}

function writeEntry(dir, file, spec, kind, events) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(
    path.join(dir, file),
    JSON.stringify({
      kind,
      spec,
      coverage: {},
      tests: [{ title: "a test", attempt: 0, state: "failed", events }],
    }),
  );
}

function readEntry(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
}

function updateEvents(dir, file, update) {
  const entry = readEntry(dir, file);
  entry.tests[0].events = update(entry.tests[0].events);
  fs.writeFileSync(path.join(dir, file), JSON.stringify(entry));
}

function writeCapture(dir) {
  writeEntry(dir, SETUP_ENTRY, SETUP_SPEC, "test", setupEvents());
  writeEntry(dir, SAVED_ENTRY, SAVED_SPEC, "test", activateTokenEvents("ch-1"));
  writeEntry(
    dir,
    CREATOR_ENTRY,
    SNAPSHOT_CREATOR,
    "snapshot",
    activateTokenEvents("ch-2"),
  );
  fs.writeFileSync(
    path.join(dir, "fnmap-1.json"),
    JSON.stringify({
      "/repo/frontend/src/a.ts": { 0: { name: "a", line: 1 } },
    }),
  );
  fs.writeFileSync(path.join(dir, "summary.txt"), "shard 0: 3 test attempts\n");
}

// Each canary goes in with a different spelling: whole in a body, clipped to 20 characters in a chain,
// inside twice-escaped JSON and a URL-encoded query, and as base64.
function plantCanaries(dir) {
  updateEvents(dir, SAVED_ENTRY, (events) =>
    events.map((event) =>
      event.kind === "request"
        ? { ...event, body: JSON.stringify({ value: ALL_FEATURES.value }) }
        : event,
    ),
  );
  updateEvents(dir, SETUP_ENTRY, (events) => [
    ...events,
    {
      seq: 2,
      kind: "command",
      name: "invoke",
      chain: `get("input").invoke("val", "${"x".repeat(280)}${STARTER_CLOUD.value.slice(0, FRAGMENT_LENGTH)}…")`,
    },
  ]);
  updateEvents(dir, CREATOR_ENTRY, (events) => [
    ...events,
    {
      seq: 2,
      kind: "assert",
      state: "failed",
      message: JSON.stringify(JSON.stringify({ value: PRO_CLOUD.value })),
    },
  ]);
  fs.appendFileSync(
    path.join(dir, "summary.txt"),
    [
      encodeURIComponent(`/admin/settings/license?token=${PRO_CLOUD.value}`),
      Buffer.from(`license:${PRO_SELF_HOSTED.value}`).toString("base64"),
    ].join("\n"),
  );
}

// Every FRAGMENT_LENGTH-character piece of every spelling of every canary.
function canaryPieces() {
  return CANARIES.flatMap(({ value }) =>
    secretForms(value).flatMap((form) =>
      Array.from({ length: form.length - FRAGMENT_LENGTH + 1 }, (_, i) =>
        form.slice(i, i + FRAGMENT_LENGTH),
      ),
    ),
  );
}

describe("canaries", () => {
  it("should give each token variable its own canary in the shape of a license token", () => {
    expect(CANARIES.map(({ variable }) => variable)).toEqual([
      "CYPRESS_MB_ALL_FEATURES_TOKEN",
      "CYPRESS_MB_STARTER_CLOUD_TOKEN",
      "CYPRESS_MB_PRO_CLOUD_TOKEN",
      "CYPRESS_MB_PRO_SELF_HOSTED_TOKEN",
    ]);
    for (const { value } of CANARIES) {
      expect(value).toMatch(/^fa4e[0-9a-f]{60}$/);
    }
    expect(new Set(CANARIES.map(({ value }) => value)).size).toBe(4);
    expect(canaryToken("pro-cloud")).toBe(PRO_CLOUD.value);
  });

  it("should name each canary secret by its label", () => {
    expect([...new Set(SECRETS.map(({ name }) => name))]).toEqual([
      "all-features",
      "starter-cloud",
      "pro-cloud",
      "pro-self-hosted",
    ]);
  });
});

describe("runEnv and unsafeVariables", () => {
  const base = {
    PATH: "/usr/bin:/bin",
    HOME: "/home/tester",
    CYPRESS_BROWSER: "chrome",
    CYPRESS_CACHE_FOLDER: "/home/tester/.cache/Cypress",
    CYPRESS_baseUrl: "http://localhost:3000",
    CYPRESS_RETRIES: "0",
    MB_JETTY_PORT: "4000",
    CYPRESS_MB_ALL_FEATURES_TOKEN: NOT_A_CANARY,
    CYPRESS_MB_PRO_CLOUD_TOKEN: NOT_A_CANARY,
    CYPRESS_ALL_FEATURES_TOKEN: NOT_A_CANARY,
    MB_PREMIUM_EMBEDDING_TOKEN: NOT_A_CANARY,
    GITHUB_TOKEN: "ghp_FakeFakeFakeFakeFakeFakeFakeFake0123",
    OPENAI_API_KEY: "sk-fake",
    LICENSE: NOT_A_CANARY,
    DATABASE_URL: "postgres://localhost/app?password=fake",
    GREP: "@smoke",
    CI: "true",
    JOURNEY_BACKEND_COVERAGE_PORT: "6300",
    CYPRESS_GUI: "true",
  };

  it("should keep secrets and run controls out of the environment and add every canary", () => {
    const env = runEnv(base, { CYPRESS_GUI: "false", JOURNEY_CAPTURE: "true" });
    expect(Object.keys(env).sort()).toEqual(
      [
        "CYPRESS_BROWSER",
        "CYPRESS_CACHE_FOLDER",
        "CYPRESS_GUI",
        "HOME",
        "JOURNEY_CAPTURE",
        "MB_JETTY_PORT",
        "PATH",
        ...CANARIES.map(({ variable }) => variable),
      ].sort(),
    );
    for (const { variable, value } of CANARIES) {
      expect(env[variable]).toBe(value);
    }
    expect(env.CYPRESS_GUI).toBe("false");
    expect(unsafeVariables(env)).toEqual([]);
  });

  it("should name a token variable that doesn't hold its canary", () => {
    const env = runEnv(base);
    delete env.CYPRESS_MB_STARTER_CLOUD_TOKEN;
    expect(
      unsafeVariables({ ...env, CYPRESS_MB_PRO_CLOUD_TOKEN: NOT_A_CANARY }),
    ).toEqual(["CYPRESS_MB_STARTER_CLOUD_TOKEN", "CYPRESS_MB_PRO_CLOUD_TOKEN"]);
  });

  it("should name any other variable named or shaped like a secret", () => {
    expect(
      unsafeVariables({
        ...runEnv(base),
        MB_PREMIUM_EMBEDDING_TOKEN: "set",
        LICENSE: NOT_A_CANARY,
        SIGNED_URL: "https://example.test/embed?jwt=a.b.c",
      }),
    ).toEqual(["MB_PREMIUM_EMBEDDING_TOKEN", "LICENSE", "SIGNED_URL"]);
  });
});

describe("the canary check on a capture output", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "journey-canary-"));
    writeCapture(path.join(dir, "raw"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const raw = () => path.join(dir, "raw");

  const scans = () => {
    const before = scanDir(raw(), SECRETS);
    const { scrubbed, scan: after } = scrubCopy(
      raw(),
      path.join(dir, "scrubbed"),
      SECRETS,
    );
    return { before, scrubbed, after };
  };

  it("should find each token route in the spec's entry", () => {
    expect(checkCaptureData(raw())).toEqual([
      {
        spec: SETUP_SPEC,
        file: SETUP_ENTRY,
        written: true,
        attempts: 1,
        requests: 1,
        reached: [
          "the token typed into the license form",
          "the license form's request",
        ],
        missed: [],
        ok: true,
      },
      {
        spec: SAVED_SPEC,
        file: SAVED_ENTRY,
        written: true,
        attempts: 1,
        requests: 1,
        reached: [
          "the cy.request of H.activateToken",
          "the .then chained on that cy.request",
        ],
        missed: [],
        ok: true,
      },
      expect.objectContaining({ spec: SNAPSHOT_CREATOR, ok: true }),
    ]);
  });

  it("should fail a spec that left no entry, no request events or a token route that didn't run", () => {
    fs.rmSync(path.join(raw(), CREATOR_ENTRY));
    updateEvents(raw(), SETUP_ENTRY, (events) =>
      events.filter(({ kind }) => kind !== "request"),
    );
    updateEvents(raw(), SAVED_ENTRY, (events) =>
      events.filter(({ name }) => name !== "then"),
    );

    const data = checkCaptureData(raw());
    expect(data.map(({ ok }) => ok)).toEqual([false, false, false]);

    const { text, pass } = report({ data, ...scans() });
    expect(pass).toBe(false);
    expect(text).toContain(`${SNAPSHOT_CREATOR} left no readable entry`);
    expect(text).toContain(`${SETUP_SPEC} recorded no request events`);
    expect(text).toContain(
      `${SETUP_SPEC} never ran the license form's request`,
    );
    expect(text).toContain(
      `${SAVED_SPEC} never ran the .then chained on that cy.request`,
    );
  });

  it("should find every canary in the capture output before the scrub, by label", () => {
    plantCanaries(raw());
    const scan = scanDir(raw(), SECRETS);
    expect(scan.ok).toBe(false);
    expect(scan.canaryFiles).toEqual({
      "all-features": [SAVED_ENTRY],
      "starter-cloud": [SETUP_ENTRY],
      "pro-cloud": [CREATOR_ENTRY, "summary.txt"],
      "pro-self-hosted": ["summary.txt"],
    });
  });

  it("should pass when the scrub removes every canary", () => {
    plantCanaries(raw());
    const { before, scrubbed, after } = scans();

    expect(after).toMatchObject({ ok: true, leftovers: [] });
    expect(Object.values(after.canaryFiles).flat()).toEqual([]);
    expect(scanDir(raw(), SECRETS).canaryFiles).toEqual(before.canaryFiles);

    const { text, pass } = report({
      data: checkCaptureData(raw()),
      before,
      scrubbed,
      after,
    });
    expect(pass).toBe(true);
    expect(text).toMatch(/^result: PASS$/m);
    expect(text).toContain(`${SAVED_ENTRY}: secret (all-features)`);
    expect(text).toContain("summary.txt: secret (pro-self-hosted)");
  });

  it("should fail when a canary is left in a binary file the scrub doesn't edit", () => {
    plantCanaries(raw());
    const exec = path.join("backend", "exec", "boot.exec");
    fs.mkdirSync(path.dirname(path.join(raw(), exec)), { recursive: true });
    fs.writeFileSync(
      path.join(raw(), exec),
      Buffer.concat([
        Buffer.from([0x01, 0xc0, 0xc0, 0x10, 0x07]),
        Buffer.from(
          Buffer.from(`t=${PRO_SELF_HOSTED.value}`).toString("base64url"),
        ),
      ]),
    );
    const { before, scrubbed, after } = scans();

    expect(after.canaryFiles).toEqual({
      "all-features": [],
      "starter-cloud": [],
      "pro-cloud": [],
      "pro-self-hosted": [exec],
    });
    const { text, pass } = report({
      data: checkCaptureData(raw()),
      before,
      scrubbed,
      after,
    });
    expect(pass).toBe(false);
    expect(text).toContain(`${exec}: secret (pro-self-hosted)`);
    expect(text).toContain(
      "the workflow's verify step would reject the scrubbed copy (leftovers: 1)",
    );
  });

  it("should never print a canary or any piece of one", () => {
    plantCanaries(raw());
    const { text } = report({
      runs: [{ name: "tests", outcome: "exited with 1" }],
      summary: "written",
      data: checkCaptureData(raw()),
      ...scans(),
    });

    expect(text).toContain("all-features in CYPRESS_MB_ALL_FEATURES_TOKEN");
    expect(canaryPieces().filter((piece) => text.includes(piece))).toEqual([]);
  });
});
