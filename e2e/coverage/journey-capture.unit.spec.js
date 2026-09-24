import { Buffer } from "node:buffer";

import jacoco from "./jacoco";
import { checkSteps, subtractBaselines } from "./journey-capture.mjs";

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
