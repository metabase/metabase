import api from "metabase/api/legacy-client";

import type { OptimizerStreamEvent } from "../types";

import { runOptimizerStream } from "./stream";

// Force a stable basename so the URL is predictable.
api.basename = "";

function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

function mockFetchOnce(body: ReadableStream<Uint8Array>, status = 200) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    body,
    json: async () => ({}),
  });
}

describe("runOptimizerStream", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses summary, proposal, and done events in order", async () => {
    const stream = makeReadableStream([
      'event: summary\ndata: {"text":"Three correlated subqueries."}\n\n',
      'event: proposal\ndata: {"id":"p1","name":"Rewrite",',
      '"kind":"rewrite","severity":"high","rationale":"Avoid fan-out.",',
      '"expected_speedup":"100x","body":"SELECT 1",',
      '"depends_on":[],"ddl_statements":[]}\n\n',
      'event: done\ndata: {"optimization_degree":40}\n\n',
    ]);
    mockFetchOnce(stream);

    const events: OptimizerStreamEvent[] = [];
    await runOptimizerStream({
      transformId: 1,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events.map((e) => e.event)).toEqual([
      "summary",
      "proposal",
      "done",
    ]);
    expect(events[0]).toEqual({
      event: "summary",
      data: { text: "Three correlated subqueries." },
    });
    expect((events[1] as { data: { id: string } }).data.id).toBe("p1");
    expect(events[2]).toEqual({
      event: "done",
      data: { optimization_degree: 40 },
    });
  });

  it("handles SSE frames split across chunk boundaries", async () => {
    const stream = makeReadableStream([
      "event: summa",
      "ry\ndata: {",
      '"text":"split"}\n\n',
    ]);
    mockFetchOnce(stream);

    const events: OptimizerStreamEvent[] = [];
    await runOptimizerStream({
      transformId: 1,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([
      { event: "summary", data: { text: "split" } },
    ]);
  });

  it("emits an error event on a non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: null,
      json: async () => ({ message: "Not supported" }),
    });

    const events: OptimizerStreamEvent[] = [];
    await runOptimizerStream({
      transformId: 1,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([
      { event: "error", data: { message: "Not supported", retryable: false } },
    ]);
  });

  it("ignores comment lines and malformed JSON frames", async () => {
    const stream = makeReadableStream([
      ": this is a heartbeat\n\n",
      "event: summary\ndata: {not-json}\n\n",
      'event: summary\ndata: {"text":"ok"}\n\n',
    ]);
    mockFetchOnce(stream);

    const events: OptimizerStreamEvent[] = [];
    await runOptimizerStream({
      transformId: 1,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([
      { event: "summary", data: { text: "ok" } },
    ]);
  });
});
