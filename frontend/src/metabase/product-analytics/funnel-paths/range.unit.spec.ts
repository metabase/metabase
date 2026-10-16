import type { AnalysisSpec, FunnelSpec } from "../spec/types";

import {
  getPathsFunnel,
  getTransitionRanges,
  getWholeFunnelRange,
} from "./range";

type FunnelOpts = {
  stepCount?: number;
  ordering?: FunnelSpec["ordering"];
};

const createFunnel = ({
  stepCount = 3,
  ordering = "loose",
}: FunnelOpts = {}): FunnelSpec => ({
  steps: Array.from({ length: stepCount }, (_, index) => ({
    index,
    flag: `ev_${index + 1}`,
    label: `Step ${index + 1}`,
  })),
  exclusions: [],
  window: { value: 7, unit: "day" },
  anchor: "first",
  ordering,
  allowRetry: false,
});

const createSpec = (funnel: FunnelSpec): AnalysisSpec => ({
  kind: "funnel",
  timeRange: { preset: "Last 30 days", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity: "week" },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  funnel,
  output: { funnelView: "steps" },
});

describe("getPathsFunnel", () => {
  it("returns a funnel with ordered steps", () => {
    const funnel = createFunnel();
    expect(getPathsFunnel(createSpec(funnel))).toBe(funnel);
  });

  it("has no paths when steps can happen in any order", () => {
    expect(
      getPathsFunnel(createSpec(createFunnel({ ordering: "any" }))),
    ).toBeUndefined();
  });

  it("has no paths before the funnel is set up", () => {
    expect(getPathsFunnel(undefined)).toBeUndefined();
  });
});

describe("getWholeFunnelRange", () => {
  it("runs from the first step to the last", () => {
    expect(getWholeFunnelRange(createFunnel({ stepCount: 4 }))).toEqual({
      start: 1,
      end: 4,
    });
  });
});

describe("getTransitionRanges", () => {
  it("has one range per transition, each step to the next", () => {
    expect(getTransitionRanges(createFunnel())).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });
});
