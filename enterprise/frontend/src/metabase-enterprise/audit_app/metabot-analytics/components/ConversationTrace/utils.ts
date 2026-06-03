import { match } from "ts-pattern";

import type { TraceSpan } from "../../types";

const NANO_PER_MS = 1e6;

/** A span plus its position in the packed waterfall. */
export type TraceRow = {
  span: TraceSpan;
  depth: number;
  /** the vertical lane (row) this span is drawn on. */
  lane: number;
  /** ms from the start of the trace to the start of this span. */
  offsetMs: number;
  /** span duration in ms (0 for an unfinished span). */
  durationMs: number;
};

/** One trace (= one Metabot turn) with its spans laid out for display. */
export type Trace = {
  traceId: string;
  /** assistant message id this turn maps to, when known. */
  messageId: number | null;
  rows: TraceRow[];
  /** number of vertical lanes the spans were packed into. */
  laneCount: number;
  /** earliest span start, epoch nanoseconds. */
  startNano: number;
  /** total wall-clock span of the trace in ms. */
  durationMs: number;
};

/**
 * Greedy lane packing: assign each span the topmost lane that is (a) strictly
 * below its parent's lane and (b) free of any time-overlap with a span already
 * on that lane. Spans are processed in start-time order (so a parent — which
 * always starts no later than its children — is placed first), which keeps each
 * lane's occupants in start order and lets us track only the latest end per lane.
 *
 * The effect: sequential siblings (steps, chats, sequential tool calls) collapse
 * onto a single lane, while genuinely parallel spans (e.g. tool calls running
 * concurrently) fan out onto extra lanes only as needed. Everything floats as
 * high as the parent constraint allows. Mutates `rows[i].lane`; returns the
 * total lane count.
 */
function packLanes(rows: TraceRow[]): number {
  const order = [...rows].sort(
    (a, b) =>
      a.offsetMs - b.offsetMs || a.depth - b.depth || a.span.id - b.span.id,
  );
  const laneBySpanId = new Map<string, number>();
  const laneEnds: number[] = [];
  for (const row of order) {
    const parentLane =
      row.span.parent_span_id != null
        ? laneBySpanId.get(row.span.parent_span_id)
        : undefined;
    const minLane = parentLane != null ? parentLane + 1 : 0;
    const endMs = row.offsetMs + Math.max(row.durationMs, 0);
    let lane = minLane;
    while (lane < laneEnds.length && laneEnds[lane] > row.offsetMs) {
      lane += 1;
    }
    row.lane = lane;
    laneBySpanId.set(row.span.span_id, lane);
    laneEnds[lane] = endMs;
  }
  return laneEnds.length;
}

const spanEndNano = (s: TraceSpan): number => s.ended_at ?? s.started_at;

/**
 * Group flat spans by `trace_id` and, within each trace, build the parent/child
 * tree (via `parent_span_id`) and flatten it depth-first. Children are ordered
 * by start time; traces are returned newest-first.
 *
 * Offsets and durations are computed relative to the trace start so the chart
 * only ever deals with small millisecond values (avoiding float precision loss
 * on the large absolute epoch-nanosecond timestamps).
 */
export function buildTraces(spans: TraceSpan[]): Trace[] {
  const byTrace = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const bucket = byTrace.get(span.trace_id);
    if (bucket) {
      bucket.push(span);
    } else {
      byTrace.set(span.trace_id, [span]);
    }
  }

  const traces: Trace[] = [];
  for (const [traceId, traceSpans] of byTrace) {
    const byId = new Map(traceSpans.map((s) => [s.span_id, s]));
    const childrenOf = new Map<string | null, TraceSpan[]>();
    for (const span of traceSpans) {
      // Treat a span whose parent isn't in this trace as a root.
      const parentKey =
        span.parent_span_id && byId.has(span.parent_span_id)
          ? span.parent_span_id
          : null;
      const siblings = childrenOf.get(parentKey);
      if (siblings) {
        siblings.push(span);
      } else {
        childrenOf.set(parentKey, [span]);
      }
    }

    const sortByStart = (a: TraceSpan, b: TraceSpan) =>
      a.started_at - b.started_at || a.id - b.id;
    for (const siblings of childrenOf.values()) {
      siblings.sort(sortByStart);
    }

    const startNano = Math.min(...traceSpans.map((s) => s.started_at));
    const endNano = Math.max(...traceSpans.map(spanEndNano));

    const rows: TraceRow[] = [];
    const walk = (span: TraceSpan, depth: number) => {
      rows.push({
        span,
        depth,
        lane: 0,
        offsetMs: (span.started_at - startNano) / NANO_PER_MS,
        durationMs: (spanEndNano(span) - span.started_at) / NANO_PER_MS,
      });
      for (const child of childrenOf.get(span.span_id) ?? []) {
        walk(child, depth + 1);
      }
    };
    for (const root of childrenOf.get(null) ?? []) {
      walk(root, 0);
    }

    const laneCount = packLanes(rows);

    traces.push({
      traceId,
      messageId: traceSpans[0]?.message_id ?? null,
      rows,
      laneCount,
      startNano,
      durationMs: (endNano - startNano) / NANO_PER_MS,
    });
  }

  return traces.sort((a, b) => b.startNano - a.startNano);
}

/** Short, human label for a span's category, used for legend/colors. */
export type SpanCategory =
  | "request"
  | "step"
  | "completions"
  | "tool"
  | "other";

export function spanCategory(span: TraceSpan): SpanCategory {
  if (span.kind === "server" || span.name === "metabot.request") {
    return "request";
  }
  if (span.name.startsWith("metabot.step")) {
    return "step";
  }
  if (span.name.startsWith("/completions")) {
    return "completions";
  }
  if (span.name.startsWith("execute_tool")) {
    return "tool";
  }
  return "other";
}

/**
 * Display label for a span in the chart/detail view. Drops the implied
 * `metabot.` prefix and the redundant detail baked into the OTel span name (the
 * model on `/completions`, the iteration index on `step`) — that info still
 * lives on the span's attributes. Tool spans keep their `execute_tool <name>` name.
 */
export function spanLabel(span: TraceSpan): string {
  return match(spanCategory(span))
    .with("request", () => "request")
    .with("step", () => "step")
    .with("completions", () => "/completions")
    .with("tool", () => span.name)
    .with("other", () => span.name)
    .exhaustive();
}

/** Format a millisecond duration compactly (e.g. "820ms", "2.4s"). */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}
