import type { AnalysisSpec, FunnelSpec } from "../spec/types";

import {
  getFunnelPathsRange,
  getPathsFunnel,
  getPathsRangeInto,
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

describe("getFunnelPathsRange", () => {
  it("defaults to the whole funnel", () => {
    expect(getFunnelPathsRange(createFunnel(), undefined)).toEqual({
      start: 1,
      end: 3,
    });
  });

  it("keeps a chosen range that fits the funnel", () => {
    expect(getFunnelPathsRange(createFunnel(), { start: 2, end: 3 })).toEqual({
      start: 2,
      end: 3,
    });
  });

  it("falls back to the whole funnel when a step was removed from under the range", () => {
    expect(
      getFunnelPathsRange(createFunnel({ stepCount: 2 }), {
        start: 2,
        end: 3,
      }),
    ).toEqual({ start: 1, end: 2 });
  });
});

describe("getPathsRangeInto", () => {
  it("shows the paths from the step before into the clicked step", () => {
    expect(getPathsRangeInto(createFunnel(), 3)).toEqual({
      start: 2,
      end: 3,
    });
  });

  it("has no paths into the first step", () => {
    expect(getPathsRangeInto(createFunnel(), 1)).toBeUndefined();
  });
});
