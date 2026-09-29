import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

import { buildSync } from "esbuild";

import { requestBodyFields } from "../support/journey-capture-encoding";

import {
  FRAGMENT_LENGTH,
  PLACEHOLDER,
  newCounts,
  parseSecrets,
  report,
  scrubDir,
  scrubString,
  secretForms,
  textMatcher,
  verifyDir,
} from "./journey-capture-scrub.mjs";

// Fake secrets in the real shapes: a license token, a signed embedding token and a GitHub token.
const TOKEN =
  "fa4e0c1d2b3a49586776859403a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4";
const JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJyZXNvdXJjZSI6eyJxdWVzdGlvbiI6MX19",
  "c2lnbmF0dXJlLW9mLXRoZS1mYWtl",
].join(".");
const GITHUB_TOKEN = ["ghs", "FakeFakeFakeFakeFakeFakeFakeFake0123"].join("_");
const PARSED = parseSecrets(
  JSON.stringify({
    STAGING_MB_ALL_FEATURES_TOKEN: TOKEN,
    github_token: GITHUB_TOKEN,
    DOCKERHUB_USERNAME: "metabase",
  }),
);
const SECRETS = PARSED.secrets;

const KEPT = {
  hex16: "0000000000000abc",
  sha: "55974e0cc93a1b2c3d4e5f60718293a4b5c6d7e8",
  uuid: "123e4567-e89b-12d3-a456-426614174000",
  entityId: "Vu4DcAcYqD2Z0Pp8ZtRwS",
};

// A fake service account key. It is JSON text, so its private key holds literal \n escapes.
const SERVICE_ACCOUNT = JSON.stringify(
  {
    type: "service_account",
    project_id: "fake-project-0000",
    private_key:
      "-----BEGIN FAKE KEY-----\nZmFrZS1rZXktYm9keS1mb3Itc2NydWItdGVzdHM=\n-----END FAKE KEY-----\n",
    client_email: "scrub-test@fake-project-0000.iam.gserviceaccount.com",
  },
  null,
  2,
);

const SPEC = "e2e/test/scenarios/onboarding/setup/setup.cy.spec.ts";
const CAPTURE_FILE = path.resolve(__dirname, "../support/per-test-capture.js");

// The base64 of a value inside longer base64 text depends on its byte alignment, so this covers all three.
function base64Fragments(value) {
  return [0, 1, 2].map((shift) => {
    const shifted = Buffer.concat([Buffer.alloc(shift), Buffer.from(value)]);
    return shifted
      .toString("base64")
      .slice(Math.ceil((shift * 8) / 6), Math.floor((shifted.length * 8) / 6));
  });
}

// Every FRAGMENT_LENGTH-character piece of the value and of its base64 forms.
function pieces(value) {
  return [value, ...base64Fragments(value)].flatMap((form) =>
    Array.from({ length: form.length - FRAGMENT_LENGTH + 1 }, (_, i) =>
      form.slice(i, i + FRAGMENT_LENGTH),
    ),
  );
}

function survivingPieces(text, value) {
  return pieces(value).filter((piece) => text.includes(piece));
}

// Runs per-test-capture.js the way Cypress serves it, bundled, in a vm with just enough of Cypress to record a test.
function loadCapture() {
  const source = buildSync({
    entryPoints: [CAPTURE_FILE],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
  }).outputFiles[0].text;
  const handlers = {};
  const hooks = { beforeEach: [], afterEach: [] };
  const tasks = [];
  const state = { window: null, runnable: null, current: null };
  const chain = (name) => ({
    then: (fn) => fn(name === "window" ? state.window : undefined),
  });
  const cy = {
    state: (key) => state[key],
    window: () => chain("window"),
    task: (name, arg) => {
      tasks.push({ name, arg });
      return chain("task");
    },
    intercept: (matcher, handler) => {
      state.interceptMatcher = matcher;
      state.interceptHandler = handler;
      return chain("intercept");
    },
  };
  const expose = {
    coverage: true,
    journeyCapture: true,
    backendCoverage: false,
    stepSnapshots: "none",
  };
  const Cypress = {
    expose: (key) => expose[key],
    config: (key) => (key === "baseUrl" ? "http://localhost:4000" : undefined),
    spec: { relative: SPEC },
    on: (event, handler) => (handlers[event] ??= []).push(handler),
    Commands: {
      overwrite: (name, fn) => {
        handlers[`overwrite:${name}`] = fn;
      },
    },
  };
  vm.runInContext(
    source,
    vm.createContext({
      Cypress,
      cy,
      beforeEach: (fn) => hooks.beforeEach.push(fn),
      afterEach: (fn) => hooks.afterEach.push(fn),
      performance,
      URL,
      fetch: () => Promise.resolve(),
    }),
  );
  const emit = (event, ...args) =>
    (handlers[event] ?? []).forEach((handler) => handler(...args));
  return { handlers, hooks, tasks, state, emit };
}

class FakeRequest {
  constructor(url, init) {
    this.url = url;
    this.method = init?.method ?? "GET";
  }
}

function fakeWindow(href) {
  class XHR {
    addEventListener() {}
  }
  XHR.prototype.open = function () {};
  return {
    location: { href, pathname: new URL(href).pathname },
    fetch: () => new Promise(() => {}),
    XMLHttpRequest: XHR,
    Request: FakeRequest,
  };
}

function fakeCommand(name, args, chainerId, prev) {
  const attrs = { name, args, chainerId, prev };
  return { get: (key) => attrs[key], attributes: attrs };
}

/**
 * Records one test attempt and returns what the capture sends to the recordTestCapture task.
 * `body` gets `run(command)` to queue and start a command, `assert(chainerId)` to end an assertion on that chain,
 * `open(href)` to load a page, and `capture` itself.
 */
function recordAttempt(body) {
  const capture = loadCapture();
  const { emit, state, hooks } = capture;
  emit("test:before:run");
  state.runnable = { type: "hook", hookName: "before each" };
  hooks.beforeEach.forEach((hook) => hook());
  state.runnable = { type: "test" };
  let assertId = 0;
  body({
    capture,
    run(command) {
      emit("command:enqueued", command.attributes);
      emit("command:start", command);
      state.current = command;
      return command;
    },
    assert(chainerId, message = "expected true to be true") {
      assertId += 1;
      emit("log:added", {
        name: "assert",
        id: assertId,
        state: "passed",
        ended: true,
        message,
        chainerId,
      });
    },
    open(href) {
      state.window = fakeWindow(href);
      emit("window:before:load", state.window);
      return state.window;
    },
  });
  state.runnable = { type: "hook", hookName: "after each" };
  hooks.afterEach.forEach((hook) =>
    hook.call({
      currentTest: {
        fullTitle: () => "setup should activate a license token",
        currentRetry: () => 0,
        state: "passed",
      },
    }),
  );
  const payload = capture.tasks.find(
    ({ name }) => name === "recordTestCapture",
  ).arg;
  return JSON.parse(JSON.stringify(payload));
}

// Passes the token the way `H.activateToken`, the license form and a long argument do, puts a JWT in URLs, and records ids the scrub must keep.
function recordLeakShapes({ run, assert, open, capture }) {
  open("http://localhost:4000/setup");
  const put = run(
    fakeCommand(
      "request",
      [
        {
          method: "PUT",
          url: "/api/setting/premium-embedding-token",
          failOnStatusCode: false,
          body: { value: TOKEN },
        },
      ],
      "ch-activate",
    ),
  );
  run(fakeCommand("then", [() => {}], "ch-activate", put));
  assert("ch-activate", "expected 204 to equal 204");
  run(
    fakeCommand(
      "wrap",
      [{ requestBody: { value: TOKEN } }, { log: false }],
      "ch-wrap",
    ),
  );

  const field = run(fakeCommand("findByLabelText", ["Token"], "ch-type"));
  const invoke = run(
    fakeCommand("invoke", ["attr", "type", "password"], "ch-type", field),
  );
  const type = run(
    fakeCommand("type", [TOKEN, { log: false }], "ch-type", invoke),
  );
  run(fakeCommand("blur", [], "ch-type", type));
  assert("ch-type", "expected <input> to be visible");

  run(
    fakeCommand(
      "request",
      [{ url: "/api/ee/license", body: { value: TOKEN }, log: false }],
      "ch-hidden-request",
    ),
  );

  const input = run(fakeCommand("get", ["input"], "ch-clip"));
  run(
    fakeCommand("invoke", ["val", "x".repeat(260) + TOKEN], "ch-clip", input),
  );

  run(
    fakeCommand(
      "request",
      ["POST", "/api/ee/license", { value: TOKEN }],
      "ch-body",
    ),
  );

  run(
    fakeCommand("request", ["GET", `/api/embed/card/${JWT}/query`], "ch-jwt"),
  );
  run(
    fakeCommand("visit", [`/embed/question/${JWT}#bordered=true`], "ch-visit"),
  );
  capture.emit(
    "url:changed",
    `http://localhost:4000/embed/question/${JWT}#bordered=true`,
  );
  capture.state.window.fetch(`/api/embed/card/${JWT}/query`);
  capture.state.interceptHandler({
    method: "GET",
    url: `http://localhost:4000/api/embed/card/${JWT}/query`,
    resourceType: "fetch",
    headers: {},
    body: "",
  });

  run(fakeCommand("visit", [`/dashboard/${KEPT.entityId}`], "ch-kept"));
  run(
    fakeCommand(
      "request",
      ["POST", `/api/action/${KEPT.uuid}/execute`, { parameters: {} }],
      "ch-kept-request",
    ),
  );
}

function writeShard(dir, payload) {
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(dir, "backend", "exec"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ schemaVersion: 2, sha: KEPT.sha, runId: "1" }),
  );
  fs.writeFileSync(
    path.join(dir, "tests", `${SPEC.replace(/\//g, "__")}.json`),
    JSON.stringify({
      kind: "test",
      spec: SPEC,
      coverage: {},
      tests: [payload],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "backend", "classes.jsonl"),
    `${JSON.stringify(["metabase/api/card$fn__1", KEPT.hex16])}\n`,
  );
  const exec = Buffer.from([0x01, 0xc0, 0xc0, 0x10, 0x07, 0x00, 0xff, 0x10]);
  fs.writeFileSync(path.join(dir, "backend", "exec", "boot.exec"), exec);
  fs.writeFileSync(
    path.join(dir, "summary.txt"),
    `shard: 1 test attempts\n  ${SPEC} :: setup should activate a license token (attempt 0)\n`,
  );
  return exec;
}

// Mulberry32, so every run generates the same documents.
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates JSON values and text that hold pieces of the spellings of `secrets`: in strings and keys,
 * in strings whose JSON escapes spell a piece, and across the punctuation between keys, values and items.
 */
function secretPieces(secrets, seed) {
  const random = seeded(seed);
  const int = (n) => Math.floor(random() * n);
  const pick = (items) => items[int(items.length)];
  const names = [...new Set(secrets.map(({ name }) => name))];
  const piece = () => {
    const name = pick(names);
    const forms = secretForms(
      pick(secrets.filter((secret) => secret.name === name)).value,
    );
    const form = random() < 0.5 ? forms[0] : pick(forms);
    const length = Math.min(form.length, 16 + int(25));
    const start = int(form.length - length + 1);
    return form.slice(start, start + length);
  };
  const word = () =>
    pick(["", "a", "GET /api/card/1", "é", "😀", "\n", "\t", '"', "\\"]);
  const parsed = (text) => {
    try {
      return [JSON.parse(text)];
    } catch {
      return [];
    }
  };
  const opens = ["", '"', "[", '["', "{", '{"', '{"k":"'];
  const closes = ["", '"', "]", '"]', "}", '"}', '":0}'];
  const holding = (text) => [
    word() + text + word(),
    ...opens.flatMap((open) =>
      closes.flatMap((close) => parsed(open + text + close)),
    ),
  ];
  const key = () => {
    const held = pick(holding(piece()));
    return typeof held === "string" ? held : word();
  };
  const value = (depth) => {
    const roll = random();
    if (depth >= 3 || roll < 0.4) {
      return pick([
        word,
        () => int(1e6),
        () => pick([true, false, null]),
        () => pick(holding(piece())),
      ])();
    }
    const entries = Array.from({ length: 1 + int(4) }, () => [
      key(),
      value(depth + 1),
    ]);
    return roll < 0.7
      ? entries.map(([, item]) => item)
      : Object.fromEntries(entries);
  };
  return {
    json: () => value(0),
    text: () =>
      Array.from({ length: 1 + int(5) }, () => word() + piece()).join(
        pick([" ", "\n", ""]),
      ),
    indent: () => pick([0, 2]),
  };
}

function readAll(dir) {
  const texts = [];
  const walk = (sub) => {
    for (const name of fs.readdirSync(path.join(dir, sub))) {
      const relative = path.join(sub, name);
      if (fs.statSync(path.join(dir, relative)).isDirectory()) {
        walk(relative);
      } else {
        texts.push(
          fs.readFileSync(path.join(dir, relative)).toString("latin1"),
        );
      }
    }
  };
  walk("");
  return texts.join("\n");
}

describe("journey capture of secrets", () => {
  it("should show only the method and path of a cy.request in every chain", () => {
    const { events } = recordAttempt(recordLeakShapes);
    const then = events.find((event) => event.name === "then");
    expect(then.chain).toBe(
      "request(PUT /api/setting/premium-embedding-token).then(fn)",
    );
    const assert = events.find(
      (event) => event.kind === "assert" && event.chainerId === "ch-activate",
    );
    expect(assert.chain).toBe(
      "request(PUT /api/setting/premium-embedding-token).then(fn)",
    );
  });

  it("should record the arguments of a {log: false} command as hidden", () => {
    const { events } = recordAttempt(recordLeakShapes);
    const chainOf = (name) => events.find((event) => event.name === name).chain;
    expect(chainOf("type")).toBe(
      'findByLabelText("Token").invoke("attr", "type", "password").type(<hidden>, <hidden>)',
    );
    expect(chainOf("blur")).toBe(
      'findByLabelText("Token").invoke("attr", "type", "password").type(<hidden>, <hidden>).blur()',
    );
    expect(chainOf("wrap")).toBe("wrap(<hidden>, <hidden>)");
    const hiddenRequest = events.find(
      (event) => event.chainerId === "ch-hidden-request",
    );
    expect(hiddenRequest).toMatchObject({
      method: "GET",
      path: "/api/ee/license",
      bodyType: "hidden",
    });
    expect(hiddenRequest.body).toBeUndefined();
  });

  it("should keep the token only in request bodies and the clipped argument before the scrub", () => {
    const { events } = recordAttempt(recordLeakShapes);
    const withToken = events.filter((event) =>
      JSON.stringify(event).includes(TOKEN.slice(0, FRAGMENT_LENGTH)),
    );
    expect(
      withToken.map(({ kind, chainerId, body, chain }) => ({
        kind,
        chainerId,
        inBody: body?.includes(TOKEN) ?? false,
        clipped: chain?.includes(`${TOKEN.slice(0, 40)}…`) ?? false,
      })),
    ).toEqual([
      {
        kind: "request",
        chainerId: "ch-activate",
        inBody: true,
        clipped: false,
      },
      { kind: "command", chainerId: "ch-clip", inBody: false, clipped: true },
      { kind: "request", chainerId: "ch-body", inBody: true, clipped: false },
    ]);
  });

  it("should record no query string on any route", () => {
    const payload = recordAttempt(({ run, open, capture }) => {
      const win = open(`http://localhost:4000/setup?token=${TOKEN}`);
      capture.emit(
        "url:changed",
        `http://localhost:4000/setup?token=${TOKEN}#license`,
      );
      win.fetch(`/api/setup/token-check?token=${TOKEN}`);
      win.fetch(
        new FakeRequest(
          `http://localhost:4000/api/setup/token-check?token=${TOKEN}`,
        ),
      );
      new win.XMLHttpRequest().open(
        "GET",
        `/api/premium-features/token/status?token=${TOKEN}`,
      );
      capture.state.interceptHandler({
        method: "GET",
        url: `http://localhost:4000/api/premium-features/token/status?token=${TOKEN}`,
        resourceType: "xhr",
        headers: {},
        body: "",
      });
      capture.state.interceptHandler({
        method: "GET",
        url: `http://localhost:4000/embed/question/1?token=${TOKEN}`,
        resourceType: "document",
        headers: {},
        body: "",
      });
      run(
        fakeCommand(
          "request",
          [`/api/session/properties?token=${TOKEN}`],
          "ch-request",
        ),
      );
      capture.handlers["overwrite:request"](
        () => {},
        "GET",
        `/api/session/properties?token=${TOKEN}`,
      );
    });
    expect(payload.routes).toEqual([
      "GET /api/premium-features/token/status",
      "GET /api/session/properties",
      "GET /api/setup/token-check",
      "GET /embed/question/1",
    ]);
    expect(payload.pages).toEqual(["/embed/question/1", "/setup"]);
    expect(survivingPieces(JSON.stringify(payload), TOKEN)).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("?");
  });
});

// Runs the harness tasks and the capture's own intercept, and a spec's tasks and stubs, one of which replies with the token.
function recordSetup({ run, open, capture }) {
  open("http://localhost:4000/");
  run(
    fakeCommand(
      "task",
      ["recordTestCapture", { title: "x" }, { log: false }],
      "ch-own-task",
    ),
  );
  run(
    fakeCommand(
      "task",
      ["resetCoverage", { isInteractive: true }],
      "ch-plugin-task",
    ),
  );
  run(
    fakeCommand(
      "intercept",
      [capture.state.interceptMatcher, () => {}],
      "ch-own-intercept",
    ),
  );
  run(
    fakeCommand(
      "task",
      ["signJwt", { payload: { user: 1 }, secret: TOKEN }],
      "ch-sign",
    ),
  );
  run(
    fakeCommand(
      "task",
      ["resetTable", { table: "many_data_types" }, { log: false }],
      "ch-hidden-task",
    ),
  );
  run(
    fakeCommand(
      "intercept",
      ["GET", "/api/user/current", { id: 1, sso_source: "ldap" }],
      "ch-stub",
    ),
  );
  run(
    fakeCommand(
      "intercept",
      ["/api/card/1", { fixture: "card.json" }],
      "ch-fixture",
    ),
  );
  run(
    fakeCommand(
      "intercept",
      [{ method: "POST", url: "/api/dataset" }, () => {}],
      "ch-handler",
    ),
  );
  run(fakeCommand("intercept", ["POST", "/api/dataset"], "ch-spy"));
  run(
    fakeCommand(
      "intercept",
      [
        "GET",
        "/api/session/properties",
        { body: { "premium-embedding-token": TOKEN, value: TOKEN } },
      ],
      "ch-token-stub",
    ),
  );
}

describe("journey capture of spec setup", () => {
  const eventOf = (events, chainerId) =>
    events.find((event) => event.chainerId === chainerId);

  it("should record a spec's tasks by name with the argument in its own fields, and leave out the harness tasks", () => {
    const { events } = recordAttempt(recordSetup);
    const argument = requestBodyFields({ payload: { user: 1 }, secret: TOKEN });

    for (const own of ["ch-own-task", "ch-plugin-task", "ch-own-intercept"]) {
      expect(eventOf(events, own)).toBeUndefined();
    }
    expect(eventOf(events, "ch-sign")).toMatchObject({
      kind: "command",
      name: "task",
      chain: 'task("signJwt")',
      arg: '{"payload":{"user":1},"secret":"<masked>"}',
      argHash: argument.bodyHash,
      argBytes: argument.bodyBytes,
    });
    expect(eventOf(events, "ch-hidden-task")).toMatchObject({
      chain: "task(<hidden>, <hidden>, <hidden>)",
      argType: "hidden",
    });
    expect(eventOf(events, "ch-hidden-task").arg).toBeUndefined();
  });

  it("should record a stub's static reply, a fixture's name and only the kind of a handler", () => {
    const { events } = recordAttempt(recordSetup);

    expect(eventOf(events, "ch-stub")).toMatchObject({
      name: "intercept",
      chain: 'intercept("GET", "/api/user/current", <reply>)',
      reply: '{"id":1,"sso_source":"ldap"}',
      replyHash: requestBodyFields({ id: 1, sso_source: "ldap" }).bodyHash,
    });
    expect(eventOf(events, "ch-fixture").reply).toBe('{"fixture":"card.json"}');
    expect(eventOf(events, "ch-handler")).toMatchObject({
      chain: 'intercept({"method":"POST","url":"/api/dataset"}, <reply>)',
      replyType: "handler",
    });
    expect(eventOf(events, "ch-handler").reply).toBeUndefined();
    const spy = eventOf(events, "ch-spy");
    expect(spy.chain).toBe('intercept("POST", "/api/dataset")');
    expect([spy.reply, spy.replyHash, spy.replyType]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("should mask reply keys named like secrets and leave the other token values to the scrub", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "journey-scrub-"));
    try {
      const payload = recordAttempt(recordSetup);
      const stub = eventOf(payload.events, "ch-token-stub");
      expect(stub.chain).toBe(
        'intercept("GET", "/api/session/properties", <reply>)',
      );
      expect(stub.reply).toBe(
        `{"body":{"premium-embedding-token":"<masked>","value":"${TOKEN}"}}`,
      );
      writeShard(dir, payload);

      scrubDir(dir, SECRETS);

      expect(verifyDir(dir, SECRETS)).toMatchObject({
        ok: true,
        leftovers: [],
      });
      expect(survivingPieces(readAll(dir), TOKEN)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scrubDir and verifyDir", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "journey-scrub-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should leave no form of the token or the JWT in a captured shard", () => {
    const payload = recordAttempt(recordLeakShapes);
    const exec = writeShard(dir, payload);
    expect(readAll(dir)).toContain(JWT);

    const scrubbed = scrubDir(dir, SECRETS);
    const verified = verifyDir(dir, SECRETS);

    expect(verified).toMatchObject({ ok: true, leftovers: [] });
    const all = readAll(dir);
    expect(survivingPieces(all, TOKEN)).toEqual([]);
    expect(all).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]*/);
    expect(scrubbed.counts.secret).toBeGreaterThanOrEqual(3);
    expect(scrubbed.counts.jwt).toBeGreaterThanOrEqual(4);
    expect(
      fs.readFileSync(path.join(dir, "backend", "exec", "boot.exec")),
    ).toEqual(exec);

    const tests = JSON.parse(
      fs.readFileSync(
        path.join(dir, "tests", `${SPEC.replace(/\//g, "__")}.json`),
        "utf8",
      ),
    );
    const events = tests.tests[0].events;
    expect(events.find((event) => event.chainerId === "ch-body").body).toBe(
      `{"value":"${PLACEHOLDER}"}`,
    );
    expect(tests.tests[0].routes).toContain(
      `GET /api/embed/card/${PLACEHOLDER}/query`,
    );
  });

  it("should keep 16- and 40-character hex, UUIDs and entity ids", () => {
    const payload = recordAttempt(recordLeakShapes);
    writeShard(dir, payload);
    const bodyHashes = payload.events
      .map((event) => event.bodyHash)
      .filter(Boolean);
    expect(bodyHashes.length).toBeGreaterThan(0);

    scrubDir(dir, SECRETS);

    const all = readAll(dir);
    for (const kept of [...Object.values(KEPT), ...bodyHashes]) {
      expect(all).toContain(kept);
    }
  });

  it("should fail verification on a secret left in a text or binary file", () => {
    writeShard(dir, recordAttempt(recordLeakShapes));
    scrubDir(dir, SECRETS);
    expect(verifyDir(dir, SECRETS).ok).toBe(true);

    fs.appendFileSync(path.join(dir, "summary.txt"), TOKEN.slice(10, 40));
    fs.appendFileSync(
      path.join(dir, "backend", "exec", "boot.exec"),
      Buffer.from(GITHUB_TOKEN),
    );
    expect(verifyDir(dir, SECRETS)).toMatchObject({
      ok: false,
      leftovers: [
        {
          file: path.join("backend", "exec", "boot.exec"),
          rule: "secret",
          name: "github_token",
        },
        {
          file: "summary.txt",
          rule: "secret",
          name: "STAGING_MB_ALL_FEATURES_TOKEN",
        },
      ],
    });
  });

  it("should count the secret replacements of each secret by name", () => {
    writeShard(dir, recordAttempt(recordLeakShapes));
    fs.appendFileSync(path.join(dir, "summary.txt"), `${GITHUB_TOKEN}\n`);

    const { counts, bySecret } = scrubDir(dir, SECRETS);

    expect(Object.keys(bySecret).sort()).toEqual([
      "STAGING_MB_ALL_FEATURES_TOKEN",
      "github_token",
    ]);
    expect(bySecret.github_token).toBe(1);
    expect(bySecret.STAGING_MB_ALL_FEATURES_TOKEN).toBeGreaterThanOrEqual(3);
    expect(Object.values(bySecret).reduce((sum, n) => sum + n, 0)).toBe(
      counts.secret,
    );
  });

  it("should print the secret replacements by name and never a secret value", () => {
    writeShard(dir, recordAttempt(recordLeakShapes));
    fs.appendFileSync(path.join(dir, "summary.txt"), `${GITHUB_TOKEN}\n`);

    const scrubbed = scrubDir(dir, SECRETS);
    const text = report({
      parsed: PARSED,
      scrubbed,
      verified: verifyDir(dir, SECRETS),
    });

    expect(text.split("\n")).toContain(
      `secret replacements by name: STAGING_MB_ALL_FEATURES_TOKEN ${scrubbed.bySecret.STAGING_MB_ALL_FEATURES_TOKEN}, github_token 1`,
    );
    expect(survivingPieces(text, TOKEN)).toEqual([]);
    expect(survivingPieces(text, GITHUB_TOKEN)).toEqual([]);
  });

  it("should print none when no secret was replaced", () => {
    fs.writeFileSync(path.join(dir, "meta.json"), "{}");

    const text = report({
      parsed: PARSED,
      scrubbed: scrubDir(dir, SECRETS),
      verified: verifyDir(dir, SECRETS),
    });

    expect(text.split("\n")).toContain("secret replacements by name: none");
  });

  it("should fail verification on a symlink", () => {
    fs.writeFileSync(path.join(dir, "meta.json"), "{}");
    fs.symlinkSync("/etc/hosts", path.join(dir, "hosts"));
    expect(verifyDir(dir, SECRETS)).toMatchObject({
      ok: false,
      leftovers: [{ file: "hosts", rule: "not a regular file" }],
    });
  });
});

describe("scrubDir on the text it writes", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "journey-scrub-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

  it("should replace a string that matches a secret only in its JSON-escaped spelling", () => {
    const parsed = parseSecrets(JSON.stringify({ SERVICE_ACCOUNT }));
    const key =
      "-----BEGIN OTHER FAKE KEY-----\nZmFrZQ==\n-----END OTHER FAKE KEY-----\n";
    const event = { kind: "request", path: "/api/database", body: key };
    write("entry.json", JSON.stringify({ kind: "test", events: [event] }));

    expect(scrubString(key, textMatcher(parsed.secrets), newCounts())).toBe(
      key,
    );
    expect(verifyDir(dir, parsed.secrets).leftovers).toEqual([
      { file: "entry.json", rule: "secret", name: "SERVICE_ACCOUNT" },
    ]);

    const scrubbed = scrubDir(dir, parsed.secrets);
    const verified = verifyDir(dir, parsed.secrets);

    expect(verified).toMatchObject({ ok: true, leftovers: [] });
    expect(JSON.parse(read("entry.json"))).toEqual({
      kind: "test",
      events: [{ ...event, body: PLACEHOLDER }],
    });
    expect(scrubbed).toMatchObject({
      changedFiles: 1,
      serialized: 1,
      replacedValues: 1,
      replacedWhole: 0,
      counts: { ...newCounts(), secret: 1 },
    });
    expect({ ...scrubbed.bySecret }).toEqual({ SERVICE_ACCOUNT: 1 });
    expect(report({ parsed, scrubbed, verified }).split("\n")).toContain(
      "written text: 1 of these replacements found after the scrub of each string, " +
        "1 JSON values or lines and 0 files or JSON documents replaced whole",
    );
  });

  it("should replace a key and its value, or two array items, that a secret spans", () => {
    const { secrets } = parseSecrets(
      JSON.stringify({
        OAUTH_CLIENT: '{"client-id-fake":"client-secret-fake"}',
        SCOPES: '["fake-scope-0001","fake-scope-0002"]',
      }),
    );
    write(
      "entry.json",
      JSON.stringify({
        kind: "test",
        body: { "client-id-fake": "client-secret-fake" },
        attempt: 0,
      }),
    );
    const classes = JSON.stringify(["metabase/api/card$fn__1"]);
    write(
      "lines.jsonl",
      `${classes}\n${JSON.stringify({ scopes: ["fake-scope-0001", "fake-scope-0002"], n: 1 })}\n`,
    );
    expect(verifyDir(dir, secrets).leftovers).toEqual([
      { file: "entry.json", rule: "secret", name: "OAUTH_CLIENT" },
      { file: "lines.jsonl", rule: "secret", name: "SCOPES" },
    ]);

    const scrubbed = scrubDir(dir, secrets);

    expect(verifyDir(dir, secrets)).toMatchObject({ ok: true, leftovers: [] });
    expect(JSON.parse(read("entry.json"))).toEqual({
      kind: "test",
      body: { [PLACEHOLDER]: PLACEHOLDER },
      attempt: 0,
    });
    expect(read("lines.jsonl")).toBe(
      `${classes}\n${JSON.stringify({ scopes: [PLACEHOLDER, PLACEHOLDER], n: 1 })}\n`,
    );
    expect(scrubbed).toMatchObject({
      serialized: 2,
      replacedValues: 4,
      replacedWhole: 0,
    });
  });

  it("should replace the JSONL lines that a secret spans", () => {
    const { secrets } = parseSecrets(
      JSON.stringify({ ACROSS_LINES: 'ab-01"]\n["fake-1' }),
    );
    const lines = ['["x","ab-01"]', '["fake-1","y"]', '["z"]'];
    write("lines.jsonl", `${lines.join("\n")}\n`);
    expect(verifyDir(dir, secrets).leftovers).toEqual([
      { file: "lines.jsonl", rule: "secret", name: "ACROSS_LINES" },
    ]);

    const scrubbed = scrubDir(dir, secrets);

    expect(verifyDir(dir, secrets)).toMatchObject({ ok: true, leftovers: [] });
    expect(read("lines.jsonl")).toBe(
      `"${PLACEHOLDER}"\n"${PLACEHOLDER}"\n["z"]\n`,
    );
    expect(scrubbed).toMatchObject({
      serialized: 1,
      replacedValues: 2,
      replacedWhole: 0,
    });
  });

  it("should replace a whole file when a match is left outside every value it can replace", () => {
    const { secrets } = parseSecrets(
      JSON.stringify({
        BRACKETS: "]".repeat(16),
        FIRST: "fake-secret-value-0001",
        AFTER_PLACEHOLDER: "d>fake-tail-000001",
      }),
    );
    const nested = Array.from({ length: 16 }).reduce((inner) => [inner], 1);
    write("nested.json", JSON.stringify(nested));
    write("summary.txt", "fake-secret-value-0001fake-tail-000001\n");

    const scrubbed = scrubDir(dir, secrets);

    expect(verifyDir(dir, secrets)).toMatchObject({ ok: true, leftovers: [] });
    expect(read("nested.json")).toBe(`"${PLACEHOLDER}"`);
    expect(read("summary.txt")).toBe(`"${PLACEHOLDER}"`);
    expect(scrubbed).toMatchObject({
      changedFiles: 2,
      serialized: 2,
      replacedValues: 0,
      replacedWhole: 2,
    });
  });

  it("should leave nothing for verifyDir in generated JSON, JSONL and text files", () => {
    const { secrets } = parseSecrets(
      JSON.stringify({
        SERVICE_ACCOUNT,
        OAUTH_CLIENT: JSON.stringify({
          client_id: "fake-client-0001",
          client_secret: "fake-client-secret-0001",
        }),
        QUOTED: 'fake "quoted" \\ secret\twith-tab-0001',
        DIGITS: "1234567890123456",
      }),
    );
    const generate = secretPieces(secrets, 1);
    for (let i = 0; i < 100; i++) {
      write(
        `${i}.json`,
        JSON.stringify(generate.json(), null, generate.indent()),
      );
      const lines = Array.from({ length: 3 }, () =>
        JSON.stringify(generate.json()),
      );
      write(`${i}.jsonl`, `${lines.join("\n")}\n`);
      write(`${i}.txt`, generate.text());
    }
    expect(verifyDir(dir, secrets).ok).toBe(false);

    const scrubbed = scrubDir(dir, secrets);

    expect(verifyDir(dir, secrets).leftovers).toEqual([]);
    expect(scrubbed.serialized).toBeGreaterThan(0);
    expect(scrubbed.replacedWhole).toBe(0);
    for (const name of fs.readdirSync(dir)) {
      const documents = name.endsWith(".json")
        ? [read(name)]
        : name.endsWith(".jsonl")
          ? read(name).split("\n").filter(Boolean)
          : [];
      for (const document of documents) {
        expect(() => JSON.parse(document)).not.toThrow();
      }
    }
  });
});

describe("scrubString", () => {
  const PERSONAL_TOKEN = ["ghp", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join(
    "_",
  );

  const scrub = (text) => {
    const counts = newCounts();
    return { text: scrubString(text, textMatcher(SECRETS), counts), counts };
  };

  it("should replace every spelling of a secret", () => {
    const spellings = [
      TOKEN,
      JSON.stringify(JSON.stringify({ value: TOKEN })),
      encodeURIComponent(`?license=${TOKEN}`),
      Buffer.from(`user:${TOKEN}`).toString("base64"),
      Buffer.from(`us:${TOKEN}`).toString("base64url"),
      Buffer.from(`usr:${TOKEN}`).toString("base64"),
      `"${TOKEN.slice(0, FRAGMENT_LENGTH)}…"`,
      `…${TOKEN.slice(-FRAGMENT_LENGTH)}`,
    ];
    for (const spelling of spellings) {
      const { text } = scrub(spelling);
      expect(text).toContain(PLACEHOLDER);
      expect(survivingPieces(text, TOKEN)).toEqual([]);
    }
  });

  it("should replace token shapes whose values it doesn't know", () => {
    const shapes = [
      [JWT.replace("c2ln", "b3Ro"), "jwt"],
      [
        "airgap_eyJhbGciOiJSU0EtT0FFUCJ9.a2V5.aXY.Y2lwaGVy.dGFn",
        "prefixed-token",
      ],
      [PERSONAL_TOKEN, "prefixed-token"],
      ["github_pat_11ABCDEFG0123456789_abcdefghijklmnop", "prefixed-token"],
      [
        ["gho", "16C7e42F292c6912E7710c838347Ae178B4a"].join("_"),
        "prefixed-token",
      ],
      ["dckr_pat_2YotnFZFEjr1zCsicMWpAA", "prefixed-token"],
      ["mb_dev_0123456789abcdef", "prefixed-token"],
      ["0123456789".repeat(7).slice(0, 64), "hex-64"],
    ];
    for (const [shape, rule] of shapes) {
      const { text, counts } = scrub(`/embed/dashboard/${shape}#titled=true`);
      expect(text).toBe(`/embed/dashboard/${PLACEHOLDER}#titled=true`);
      expect(counts).toEqual({ ...newCounts(), [rule]: 1 });
    }
  });

  it("should replace a whole JWT that shares a piece with a secret", () => {
    const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const secretJwt = [
      header,
      "eyJpc3MiOiJmYWtlLWlzc3VlciJ9",
      "ZmFrZS1zaWduYXR1cmUtb2YtdGhlLXNlY3JldA",
    ].join(".");
    const capturedJwt = [
      header,
      "eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfX0",
      "b3RoZXItZmFrZS1zaWduYXR1cmU",
    ].join(".");
    const { secrets } = parseSecrets(
      JSON.stringify({ SIGNED_TOKEN: secretJwt }),
    );
    const counts = newCounts();
    expect(
      scrubString(
        `/api/embed/dashboard/${capturedJwt}`,
        textMatcher(secrets),
        counts,
      ),
    ).toBe(`/api/embed/dashboard/${PLACEHOLDER}`);
    expect(counts).toEqual({ ...newCounts(), secret: 1, jwt: 1 });
  });

  it("should replace a prefixed token at the start or after a space, quote, = or /", () => {
    const tokens = [
      "airgap_eyJhbGciOiJSU0EtT0FFUCJ9.a2V5.aXY.Y2lwaGVy.dGFn",
      PERSONAL_TOKEN,
      "mb_dev_0123456789abcdef",
    ];
    for (const token of tokens) {
      for (const before of ["", " ", '"', "=", "/"]) {
        expect(scrub(`${before}${token}`)).toEqual({
          text: `${before}${PLACEHOLDER}`,
          counts: { ...newCounts(), "prefixed-token": 1 },
        });
      }
    }
  });

  it("should keep class names that hold a token prefix or a JWT start after _ or $", () => {
    const classNames = [
      "metabase/premium_features/token_check$assert_valid_airgap_user_count_BANG_",
      "metabase/premium_features/token_check$fn__12345$decode_airgap_token__12346",
      "metabase/premium_features/token_check$assert_airgap_allows_user_creation_BANG_",
      "metabase/premium_features/token_check$airgap_user_count_BANG_",
      "metabase/api/embed$eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.c2ln",
    ];
    for (const className of classNames) {
      expect(scrub(className)).toEqual({
        text: className,
        counts: newCounts(),
      });
    }
  });

  it("should replace the values of query parameters named like secrets", () => {
    expect(
      scrub(
        'visit("/setup?first_name=John&license_token=abc123DEF&x=1").url("/auth/sso?jwt=a.b.c;api_key=k1")',
      ).text,
    ).toBe(
      `visit("/setup?first_name=John&license_token=${PLACEHOLDER}&x=1").url("/auth/sso?jwt=${PLACEHOLDER};api_key=${PLACEHOLDER}")`,
    );
  });

  it("should keep hashes, commit SHAs, UUIDs, entity ids and short secrets", () => {
    const text = [
      KEPT.hex16,
      KEPT.sha,
      KEPT.uuid,
      KEPT.entityId,
      "metabase/api/card$fn__12345",
      "/home/runner/work/metabase/metabase/frontend/src/a.ts",
      "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxfX0=",
      "0123456789abcdef".repeat(3),
    ].join(" ");
    expect(scrub(text).text).toBe(text);
  });
});

describe("parseSecrets", () => {
  it("should keep each value, trimmed and line by line, and count the secrets too short to scrub", () => {
    const parsed = parseSecrets(
      JSON.stringify({
        PEM: "-----BEGIN KEY-----\nAAAAB3NzaC1yc2EAAAADAQABAAABAQ\n-----END KEY-----\n",
        PADDED: "  0123456789abcdef  ",
        DOCKERHUB_USERNAME: "metabase",
      }),
    );
    expect(parsed.short).toBe(1);
    expect(parsed.names).toBe(2);
    expect(parsed.secrets.map(({ value }) => value)).toEqual(
      expect.arrayContaining([
        "AAAAB3NzaC1yc2EAAAADAQABAAABAQ",
        "-----BEGIN KEY-----",
        "0123456789abcdef",
        "  0123456789abcdef  ",
      ]),
    );
    expect(parsed.secrets.map(({ value }) => value)).not.toContain("metabase");
  });
});
