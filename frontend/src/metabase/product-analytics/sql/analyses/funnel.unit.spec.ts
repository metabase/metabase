import { FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN } from "metabase/viz-core";

import {
  MEDIAN_SECONDS_FROM_PREVIOUS_COLUMN,
  getFunnelStepLabels,
  getFunnelStepNumber,
  getTimeToConvertBuckets,
} from "./funnel";

const STEP_NAMES = ["Viewed pricing", "Started trial", "Purchased"];

describe("getFunnelStepLabels", () => {
  it.each(["loose", "strict"] as const)(
    "numbers and names the steps in %s order",
    (ordering) => {
      expect(getFunnelStepLabels(STEP_NAMES, ordering)).toEqual([
        "1. Viewed pricing",
        "2. Started trial",
        "3. Purchased",
      ]);
    },
  );

  it("counts the steps in any order, since any of them can make up a bar", () => {
    expect(getFunnelStepLabels(STEP_NAMES, "any")).toEqual([
      "Completed 1 step",
      "Completed 2 steps",
      "Completed 3 steps",
    ]);
  });
});

describe("getFunnelStepNumber", () => {
  const labels = getFunnelStepLabels(STEP_NAMES, "any");

  it("finds a clicked label's step, numbered from 1", () => {
    expect(getFunnelStepNumber(labels, "Completed 2 steps")).toBe(2);
  });

  it.each([null, "2. Started trial", 2])(
    "is null for a label that isn't one of the steps: %p",
    (label) => {
      expect(getFunnelStepNumber(labels, label)).toBeNull();
    },
  );
});

describe("getTimeToConvertBuckets", () => {
  it("covers the window in widening ranges, then everyone slower", () => {
    const labels = getTimeToConvertBuckets({ value: 1, unit: "hour" }).map(
      (bucket) => bucket.label,
    );
    expect(labels).toEqual([
      "< 10s",
      "10s–30s",
      "30s–1m",
      "1m–5m",
      "5m–15m",
      "15m–30m",
      "30m–1h",
      "1h+",
    ]);
  });

  it("ends the last range at a window between the usual edges", () => {
    const buckets = getTimeToConvertBuckets({ value: 10, unit: "day" });
    expect(buckets.slice(-3).map((bucket) => bucket.label)).toEqual([
      "5d–7d",
      "7d–10d",
      "10d+",
    ]);
    expect(buckets.map((bucket) => bucket.index)).toEqual(
      buckets.map((_, index) => index + 1),
    );
  });
});

it("names the median time column the way the steps chart reads it", () => {
  expect(MEDIAN_SECONDS_FROM_PREVIOUS_COLUMN).toBe(
    FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN,
  );
});
