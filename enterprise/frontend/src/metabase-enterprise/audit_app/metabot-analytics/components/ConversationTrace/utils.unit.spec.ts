import type { TraceSpan } from "../../types";

import {
  buildTraces,
  formatDurationMs,
  spanCategory,
  spanLabel,
} from "./utils";

const MS = 1e6;

function span(
  overrides: Partial<TraceSpan> & Pick<TraceSpan, "span_id">,
): TraceSpan {
  return {
    id: 1,
    trace_id: "t1",
    parent_span_id: null,
    message_id: 10,
    name: "span",
    kind: "internal",
    status: "ok",
    status_message: null,
    started_at: 0,
    ended_at: 0,
    attributes: null,
    events: null,
    ...overrides,
  };
}

describe("buildTraces", () => {
  it("builds a depth-first tree with offsets and durations relative to the trace start", () => {
    const spans = [
      span({
        span_id: "root",
        name: "metabot.request",
        started_at: 1000 * MS,
        ended_at: 5000 * MS,
      }),
      span({
        span_id: "step",
        parent_span_id: "root",
        started_at: 1100 * MS,
        ended_at: 4000 * MS,
      }),
      span({
        span_id: "tool",
        parent_span_id: "step",
        started_at: 1200 * MS,
        ended_at: 1500 * MS,
      }),
    ];

    const [trace] = buildTraces(spans);

    expect(trace.rows.map((r) => [r.span.span_id, r.depth])).toEqual([
      ["root", 0],
      ["step", 1],
      ["tool", 2],
    ]);
    // root starts the trace, so its offset is 0 and duration is the full span
    expect(trace.rows[0]).toMatchObject({ offsetMs: 0, durationMs: 4000 });
    expect(trace.rows[2]).toMatchObject({ offsetMs: 200, durationMs: 300 });
    expect(trace.durationMs).toBe(4000);
  });

  it("orders sibling spans by start time", () => {
    const spans = [
      span({ span_id: "root", started_at: 0, ended_at: 100 * MS }),
      span({
        span_id: "b",
        parent_span_id: "root",
        started_at: 50 * MS,
        ended_at: 60 * MS,
      }),
      span({
        span_id: "a",
        parent_span_id: "root",
        started_at: 10 * MS,
        ended_at: 20 * MS,
      }),
    ];

    const [trace] = buildTraces(spans);

    expect(trace.rows.map((r) => r.span.span_id)).toEqual(["root", "a", "b"]);
  });

  it("treats a span whose parent is absent from the trace as a root", () => {
    const spans = [
      span({
        span_id: "orphan",
        parent_span_id: "missing",
        started_at: 0,
        ended_at: 10 * MS,
      }),
    ];

    const [trace] = buildTraces(spans);

    expect(trace.rows).toHaveLength(1);
    expect(trace.rows[0].depth).toBe(0);
  });

  it("groups spans by trace_id and returns traces newest-first", () => {
    const spans = [
      span({
        span_id: "old",
        trace_id: "old",
        started_at: 100 * MS,
        ended_at: 200 * MS,
      }),
      span({
        span_id: "new",
        trace_id: "new",
        started_at: 900 * MS,
        ended_at: 950 * MS,
      }),
    ];

    const traces = buildTraces(spans);

    expect(traces.map((tr) => tr.traceId)).toEqual(["new", "old"]);
  });

  it("uses started_at as the end for an unfinished span (zero duration)", () => {
    const spans = [
      span({ span_id: "x", started_at: 1000 * MS, ended_at: null }),
    ];

    const [trace] = buildTraces(spans);

    expect(trace.rows[0].durationMs).toBe(0);
    expect(trace.durationMs).toBe(0);
  });
});

describe("buildTraces lane packing", () => {
  const lanesById = (trace: { rows: { span: TraceSpan; lane: number }[] }) =>
    Object.fromEntries(trace.rows.map((r) => [r.span.span_id, r.lane]));

  it("packs sequential siblings onto one lane, below the parent", () => {
    const [trace] = buildTraces([
      span({ span_id: "root", started_at: 0, ended_at: 100 * MS }),
      span({
        span_id: "a",
        parent_span_id: "root",
        started_at: 0,
        ended_at: 40 * MS,
      }),
      span({
        span_id: "b",
        parent_span_id: "root",
        started_at: 50 * MS,
        ended_at: 90 * MS,
      }),
    ]);
    const lane = lanesById(trace);
    expect(lane).toEqual({ root: 0, a: 1, b: 1 });
    expect(trace.laneCount).toBe(2);
  });

  it("fans parallel (overlapping) siblings onto separate lanes", () => {
    const [trace] = buildTraces([
      span({ span_id: "root", started_at: 0, ended_at: 100 * MS }),
      span({
        span_id: "a",
        parent_span_id: "root",
        started_at: 0,
        ended_at: 60 * MS,
      }),
      span({
        span_id: "b",
        parent_span_id: "root",
        started_at: 10 * MS,
        ended_at: 70 * MS,
      }),
    ]);
    const lane = lanesById(trace);
    expect(lane).toEqual({ root: 0, a: 1, b: 2 });
    expect(trace.laneCount).toBe(3);
  });

  it("places a grandchild strictly below its parent's lane", () => {
    const [trace] = buildTraces([
      span({ span_id: "root", started_at: 0, ended_at: 100 * MS }),
      span({
        span_id: "a",
        parent_span_id: "root",
        started_at: 0,
        ended_at: 50 * MS,
      }),
      span({
        span_id: "g",
        parent_span_id: "a",
        started_at: 0,
        ended_at: 20 * MS,
      }),
    ]);
    const lane = lanesById(trace);
    expect(lane).toEqual({ root: 0, a: 1, g: 2 });
  });
});

describe("spanCategory", () => {
  it("classifies each span kind/name", () => {
    expect(
      spanCategory(
        span({ span_id: "a", kind: "server", name: "metabot.request" }),
      ),
    ).toBe("request");
    expect(
      spanCategory(
        span({ span_id: "b", kind: "internal", name: "metabot.step 0" }),
      ),
    ).toBe("step");
    expect(
      spanCategory(
        span({
          span_id: "c",
          kind: "client",
          name: "/completions anthropic/x",
        }),
      ),
    ).toBe("completions");
    expect(
      spanCategory(
        span({ span_id: "d", kind: "internal", name: "execute_tool search" }),
      ),
    ).toBe("tool");
    expect(
      spanCategory(
        span({ span_id: "e", kind: "internal", name: "something else" }),
      ),
    ).toBe("other");
  });
});

describe("spanLabel", () => {
  it("drops the metabot. prefix, model, and iteration; keeps tool names", () => {
    expect(
      spanLabel(
        span({ span_id: "a", kind: "server", name: "metabot.request" }),
      ),
    ).toBe("request");
    expect(spanLabel(span({ span_id: "b", name: "metabot.step 3" }))).toBe(
      "step",
    );
    expect(
      spanLabel(
        span({
          span_id: "c",
          kind: "client",
          name: "/completions anthropic/claude-sonnet-4-6",
        }),
      ),
    ).toBe("/completions");
    expect(spanLabel(span({ span_id: "d", name: "execute_tool search" }))).toBe(
      "execute_tool search",
    );
  });
});

describe("formatDurationMs", () => {
  it("formats sub-second, seconds, and large durations", () => {
    expect(formatDurationMs(820)).toBe("820ms");
    expect(formatDurationMs(2400)).toBe("2.40s");
    expect(formatDurationMs(125000)).toBe("125.0s");
  });
});
