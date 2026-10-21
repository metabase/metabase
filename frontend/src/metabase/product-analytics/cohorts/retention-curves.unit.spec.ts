import type { AnalysisSpec } from "../spec/types";

import {
  type RetentionCurvesView,
  getCohortTableSettings,
  getRetentionCurvesSettings,
} from "./retention-curves";

const VIEW: RetentionCurvesView = {
  period: "week",
  isPercent: true,
  lines: "each",
  xAxis: "sinceStart",
};

const createSpec = (
  granularity: AnalysisSpec["bucket"]["granularity"],
  cohortsDisplay: "percent" | "counts" = "percent",
): AnalysisSpec => ({
  kind: "cohorts",
  timeRange: { preset: "Last 30 days", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  output: { cohortsDisplay },
});

describe("getRetentionCurvesSettings", () => {
  it("draws a line per cohort over the period offsets", () => {
    const settings = getRetentionCurvesSettings(VIEW);
    expect(settings["graph.dimensions"]).toEqual(["offset", "cohort"]);
    expect(settings["graph.metrics"]).toEqual(["value"]);
    expect(settings["graph.x_axis.scale"]).toBe("ordinal");
    expect(settings["graph.x_axis.title_text"]).toBe("Weeks since start");
  });

  it("titles the average line", () => {
    const settings = getRetentionCurvesSettings({ ...VIEW, lines: "average" });
    expect(settings.series_settings?.value?.title).toBe("All cohorts");
  });

  it("formats percentages only when the chart shows them", () => {
    expect(getRetentionCurvesSettings(VIEW).column_settings).toBeDefined();
    expect(
      getRetentionCurvesSettings({ ...VIEW, isPercent: false }).column_settings,
    ).toBeUndefined();
  });
});

describe("getCohortTableSettings", () => {
  it("follows the granularity and the value shown", () => {
    expect(getCohortTableSettings(createSpec("hour", "counts"))).toEqual({
      "cohort.period": "day",
      "cohort.value_format": "counts",
    });
  });
});
