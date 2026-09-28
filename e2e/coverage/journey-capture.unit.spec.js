import { Buffer } from "node:buffer";

import {
  MAX_BODY_TEXT,
  addBranchHits,
  canonicalBody,
  flattenBranchHits,
  hashText,
  indexBranchHits,
  proxyBodyFields,
  requestBodyArg,
  requestBodyFields,
} from "../support/journey-capture-encoding";

import jacoco from "./jacoco";
import {
  assertionChains,
  checkSteps,
  firedBranches,
  subtractBaselines,
} from "./journey-capture.mjs";

function utf(text) {
  const bytes = Buffer.from(text, "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function long(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

function probes(hits) {
  const packed = Buffer.alloc(Math.ceil(hits.length / 8));
  hits.forEach((hit, i) => {
    if (hit) {
      packed[i >> 3] |= 1 << (i & 7);
    }
  });
  return Buffer.concat([Buffer.from([hits.length]), packed]);
}

// What the agent answers to a dump command: header, session, class data, CMD_OK.
function agentAnswer(classes) {
  return Buffer.concat([
    Buffer.from([0x01, 0xc0, 0xc0, 0x10, 0x07]),
    Buffer.from([0x10]),
    utf("session"),
    long(1000),
    long(2500),
    ...classes.flatMap(({ id, name, hits }) => [
      Buffer.from([0x11]),
      long(id),
      utf(name),
      probes(hits),
    ]),
    Buffer.from([0x20]),
  ]);
}

describe("jacoco.parseExecutionData", () => {
  const answer = agentAnswer([
    {
      id: 0xabc,
      name: "metabase/api/card$fn__1",
      hits: [true, false, false, false, false, false, false, false, true],
    },
    { id: 0xdef, name: "metabase/api/card$fn__2", hits: [false, false] },
  ]);

  it("should read sessions and probe counts", () => {
    const parsed = jacoco.parseExecutionData(answer);
    expect(parsed.sessions).toEqual([
      { id: "session", start: 1000, dump: 2500 },
    ]);
    expect(
      parsed.classes.map(({ id, name, probes }) => [
        id,
        name,
        probes.length,
        probes.hits,
      ]),
    ).toEqual([
      ["0000000000000abc", "metabase/api/card$fn__1", 9, 2],
      ["0000000000000def", "metabase/api/card$fn__2", 2, 0],
    ]);
    expect(parsed.end).toBe(answer.length - 1);
  });

  it("should return null while the answer is still arriving", () => {
    expect(
      jacoco.parseExecutionData(answer.subarray(0, answer.length - 6)),
    ).toBeNull();
  });

  it("should wait for CMD_OK when a remote answer stops between two blocks", () => {
    const withoutCmdOk = answer.subarray(0, answer.length - 1);
    expect(
      jacoco.parseExecutionData(withoutCmdOk, { remote: true }),
    ).toBeNull();
    expect(jacoco.parseExecutionData(withoutCmdOk).classes).toHaveLength(2);
  });

  it("should keep only classes with a probe hit in the hit set", () => {
    expect(jacoco.hitClasses(jacoco.parseExecutionData(answer))).toEqual([
      "metabase/api/card$fn__1 0000000000000abc",
    ]);
  });
});

describe("subtractBaselines", () => {
  const runnerFile = "/home/runner/work/metabase/metabase/frontend/src/a.ts";
  const shard = {
    classes: [
      ["metabase/server$boot", "01"],
      ["metabase/api/card$fetch", "02"],
    ],
    baselines: [
      {
        kind: "baseline",
        baseline: { name: "coverage-baseline", round: "start" },
        tests: [
          {
            f: { [runnerFile]: { 0: 3 } },
            routes: ["GET /api/user/current"],
            backend: { test: { classes: [0] } },
          },
        ],
      },
    ],
    backendBaselines: [],
    tests: [
      {
        kind: "test",
        spec: "e2e/test/scenarios/a.cy.spec.js",
        tests: [
          {
            title: "a works",
            attempt: 0,
            state: "passed",
            f: { [runnerFile]: { 0: 5, 1: 1, 2: 0 } },
            routes: ["GET /api/user/current", "GET /api/card/12"],
            backend: { beforeTest: null, test: { classes: [0, 1] } },
            events: [],
          },
        ],
      },
    ],
  };

  it("should remove what the baselines fired and keep the rest", () => {
    const [test] = subtractBaselines(shard);
    expect(test.functions).toEqual(["frontend/src/a.ts#1"]);
    expect(test.routes).toEqual(["GET /api/card/:id"]);
    expect(test.backendClasses).toEqual(["metabase/api/card$fetch"]);
  });

  it("should return the raw sets when no baseline is chosen", () => {
    const [test] = subtractBaselines(shard, {
      frontend: [],
      routes: [],
      backend: [],
    });
    expect(test.functions).toEqual([
      "frontend/src/a.ts#0",
      "frontend/src/a.ts#1",
    ]);
    expect(test.backendClasses).toEqual([
      "metabase/server$boot",
      "metabase/api/card$fetch",
    ]);
  });
});

describe("checkSteps", () => {
  const file = "/home/runner/work/metabase/metabase/frontend/src/a.ts";
  const test = {
    f: { [file]: { 0: 3, 4: 1 } },
    steps: {
      files: [file],
      cuts: [
        { f: [0, 0, 2], backend: { window: { start: 10, end: 20 } } },
        { f: [0, 0, 1, 0, 4, 1], backend: { window: { start: 20, end: 35 } } },
      ],
    },
    backend: { beforeTest: { window: { start: 0, end: 10 } } },
  };

  it("should accept steps that add up to the per-test data", () => {
    const check = checkSteps(test);
    expect(check.frontend.ok).toBe(true);
    expect(check.backend).toMatchObject({ gapMs: 0, overlapMs: 0, failed: 0 });
  });

  it("should report counts the steps miss and gaps between dump windows", () => {
    const check = checkSteps({
      ...test,
      f: { [file]: { 0: 4, 4: 1, 7: 1 } },
      steps: {
        ...test.steps,
        cuts: [
          test.steps.cuts[0],
          {
            ...test.steps.cuts[1],
            backend: { window: { start: 25, end: 35 } },
          },
        ],
      },
    });
    expect(check.frontend).toMatchObject({
      ok: false,
      mismatched: 1,
      missing: 1,
    });
    expect(check.backend.gapMs).toBe(5);
  });

  it("should expect no dump for cuts that skipped theirs and count failed requests as missing", () => {
    const check = checkSteps({
      ...test,
      steps: {
        ...test.steps,
        cuts: [
          { f: [], dumpSkipped: true },
          { f: [], dumpFailed: true },
          test.steps.cuts[0],
          { f: [], dumpSkipped: true },
          test.steps.cuts[1],
        ],
      },
    });
    expect(check.frontend.ok).toBe(true);
    expect(check.backend).toMatchObject({
      mergedCuts: 2,
      failedRequests: 1,
      cutsWithoutDump: 1,
      gapMs: 0,
    });
  });

  it("should count backend dumps that ran in a different order than their cuts", () => {
    const check = checkSteps({
      ...test,
      steps: {
        ...test.steps,
        cuts: [
          { f: [0, 0, 3], backend: { window: { start: 20, end: 35 } } },
          { f: [0, 4, 1], backend: { window: { start: 10, end: 20 } } },
        ],
      },
    });
    expect(check.backend).toMatchObject({ outOfOrder: 1, gapMs: 0 });
  });
});

describe("hashText", () => {
  it("should hash the UTF-8 bytes with FNV-1a 64", () => {
    expect(hashText("")).toEqual({ hash: "cbf29ce484222325", bytes: 0 });
    expect(hashText("a")).toEqual({ hash: "af63dc4c8601ec8c", bytes: 1 });
    expect(hashText("foobar").hash).toBe("85944171f73967e8");
  });

  it("should match hashing the bytes TextEncoder produces", () => {
    const text = "héllo ✓ 😀 \ud800";
    const bytes = new TextEncoder().encode(text);
    let reference = 0xcbf29ce484222325n;
    for (const byte of bytes) {
      reference ^= BigInt(byte);
      reference = (reference * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    expect(hashText(text)).toEqual({
      hash: reference.toString(16).padStart(16, "0"),
      bytes: bytes.length,
    });
  });
});

describe("canonicalBody", () => {
  it("should sort keys at every level and keep array order", () => {
    expect(
      canonicalBody({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("should give the same text for the same body built in a different key order", () => {
    expect(canonicalBody({ name: "q", display: "table" })).toBe(
      canonicalBody({ display: "table", name: "q" }),
    );
  });

  it("should mask the values of password, token, secret and session keys anywhere in the body", () => {
    expect(
      canonicalBody({
        email: "a@b.c",
        Password: "hunter2",
        details: { "ldap-password": 1, api_TOKEN: { nested: true } },
        list: [{ "jwt-shared-secret": "x", session_id: "y", value: "kept" }],
      }),
    ).toBe(
      '{"Password":"<masked>","details":{"api_TOKEN":"<masked>","ldap-password":"<masked>"},' +
        '"email":"a@b.c","list":[{"jwt-shared-secret":"<masked>","session_id":"<masked>","value":"kept"}]}',
    );
  });

  it("should drop undefined and function values like JSON does", () => {
    expect(canonicalBody({ a: undefined, b: () => 1, c: [undefined] })).toBe(
      '{"c":[null]}',
    );
  });

  it("should canonicalize a string that holds JSON and mask form fields in other strings", () => {
    expect(canonicalBody('{"b":1,"password":"x","a":2}')).toBe(
      '{"a":2,"b":1,"password":"<masked>"}',
    );
    expect(canonicalBody("username=a&password=b&x=1")).toBe(
      '"username=a&password=<masked>&x=1"',
    );
  });
});

describe("requestBodyFields", () => {
  it("should record nothing for a body-less request", () => {
    expect(requestBodyFields(undefined)).toEqual({});
  });

  it("should record the canonical body with the hash and length of the whole of it", () => {
    const fields = requestBodyFields({ b: [1, 2], a: "x" });
    expect(fields).toEqual({
      body: '{"a":"x","b":[1,2]}',
      ...(({ hash, bytes }) => ({ bodyHash: hash, bodyBytes: bytes }))(
        hashText('{"a":"x","b":[1,2]}'),
      ),
    });
  });

  it("should clip the recorded body but hash all of it", () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ i })) };
    const small = { rows: big.rows.slice(0, 400) };
    const fields = requestBodyFields(big);
    expect(fields.body).toHaveLength(MAX_BODY_TEXT + 1);
    expect(fields.body.endsWith("…")).toBe(true);
    expect(fields.bodyBytes).toBe(canonicalBody(big).length);
    expect(fields.body).toBe(requestBodyFields(small).body);
    expect(fields.bodyHash).not.toBe(requestBodyFields(small).bodyHash);
  });

  it("should record only the type of a body that is not plain JSON", () => {
    expect(requestBodyFields(new Map([["a", 1]]))).toEqual({
      bodyType: "Map",
    });
    expect(requestBodyFields(new Uint8Array([1, 2]))).toEqual({
      bodyType: "Uint8Array",
    });
  });
});

describe("requestBodyArg", () => {
  const isMethod = (value) =>
    ["GET", "POST", "PUT"].includes(String(value).toUpperCase());

  it("should find the body the way cy.request reads its arguments", () => {
    expect(requestBodyArg(["/api/card"], isMethod)).toBeUndefined();
    expect(requestBodyArg(["/api/card", { a: 1 }], isMethod)).toEqual({
      a: 1,
    });
    expect(requestBodyArg(["POST", "/api/card"], isMethod)).toBeUndefined();
    expect(requestBodyArg(["POST", "/api/card", { a: 2 }], isMethod)).toEqual({
      a: 2,
    });
    expect(
      requestBodyArg([{ url: "/api/card", body: { a: 3 } }], isMethod),
    ).toEqual({ a: 3 });
    expect(requestBodyArg([{ url: "/api/card" }], isMethod)).toBeUndefined();
  });
});

describe("proxyBodyFields", () => {
  it("should hash the JSON text Cypress forwards for a parsed JSON body", () => {
    const raw = '{"type":"query","query":{"source-table":2}}';
    const { hash, bytes } = hashText(raw);
    expect(
      proxyBodyFields(JSON.parse(raw), { "content-type": "application/json" }),
    ).toEqual({ bodyHash: hash, bodyBytes: bytes });
  });

  it("should hash string bodies as they are", () => {
    expect(proxyBodyFields("a=1&b=2", {}).bodyHash).toBe(
      hashText("a=1&b=2").hash,
    );
  });

  it("should record only the type and length of multipart bodies", () => {
    expect(
      proxyBodyFields("--x\r\nfile\r\n--x--", {
        "Content-Type": "multipart/form-data; boundary=x",
      }),
    ).toEqual({ bodyType: "multipart", bodyBytes: 16 });
  });

  it("should record only the type of a binary body", () => {
    expect(
      proxyBodyFields(Buffer.from("binary"), {
        "content-type": "application/octet-stream",
      }),
    ).toEqual({ bodyType: "Uint8Array" });
  });

  it("should record nothing for an empty body", () => {
    expect(proxyBodyFields("", {})).toEqual({});
    expect(proxyBodyFields(undefined, {})).toEqual({});
  });
});

describe("branch hits", () => {
  const fileA = "/home/runner/work/metabase/metabase/frontend/src/a.ts";
  const fileB = "/home/runner/work/metabase/metabase/frontend/src/b.ts";

  it("should keep only the arms that ran, summed across windows", () => {
    const hits = {};
    addBranchHits(hits, fileA, { 0: [0, 2], 1: [0, 0], 2: [1, 0, 3] });
    addBranchHits(hits, fileB, { 0: [0, 0] });
    addBranchHits(hits, fileA, { 0: [0, 1] });
    expect(flattenBranchHits(hits)).toEqual({
      files: [fileA],
      hits: [0, 0, 1, 3, 0, 2, 0, 1, 0, 2, 2, 3],
    });
  });

  it("should share one file table across the tests of a spec", () => {
    const first = {
      branchHits: { files: [fileB, fileA], hits: [0, 1, 0, 1, 1, 4, 1, 2] },
    };
    const second = { branchHits: { files: [fileA], hits: [0, 4, 0, 5] } };
    const control = { title: "no branch hits" };
    const files = indexBranchHits([first, second, control]);
    expect(files).toEqual([fileB, fileA]);
    expect(first.branchHits).toEqual([0, 1, 0, 1, 1, 4, 1, 2]);
    expect(second.branchHits).toEqual([1, 4, 0, 5]);
    expect(control.branchHits).toBeUndefined();

    const entry = { branchFiles: files, tests: [first, second] };
    expect([...firedBranches(entry, second)]).toEqual([
      "frontend/src/a.ts#4:0",
    ]);
    expect([...firedBranches(entry, { f: {} })]).toEqual([]);
  });

  it("should subtract the arms the baselines ran", () => {
    const shard = {
      classes: [],
      backendBaselines: [],
      baselines: [
        {
          baseline: { name: "coverage-baseline", round: "start" },
          branchFiles: [fileA],
          tests: [{ branchHits: [0, 0, 1, 1] }],
        },
      ],
      tests: [
        {
          spec: "e2e/test/scenarios/a.cy.spec.js",
          branchFiles: [fileA],
          tests: [{ title: "a", branchHits: [0, 0, 1, 2, 0, 0, 0, 1] }],
        },
      ],
    };
    const [test] = subtractBaselines(shard);
    expect(test.branches).toEqual(["frontend/src/a.ts#0:0"]);
  });
});

describe("assertionChains", () => {
  it("should join each assertion to the commands that share its chainerId", () => {
    const events = [
      { seq: 0, kind: "request", initiator: "cy.request", chainerId: "ch-1" },
      { seq: 1, kind: "command", name: "get", chainerId: "ch-2" },
      { seq: 2, kind: "command", name: "click", chainerId: "ch-3" },
      { seq: 3, kind: "assert", message: "visible", chainerId: "ch-2" },
      { seq: 4, kind: "request", initiator: "fetch", chainerId: "ch-2" },
      { seq: 5, kind: "assert", message: "status", chainerId: "ch-1" },
      { seq: 6, kind: "assert", message: "schema 1" },
    ];
    expect(
      assertionChains(events).map(({ assert, commands }) => [
        assert.seq,
        commands.map((event) => event.seq),
      ]),
    ).toEqual([
      [3, [1]],
      [5, [0]],
      [6, []],
    ]);
  });
});
