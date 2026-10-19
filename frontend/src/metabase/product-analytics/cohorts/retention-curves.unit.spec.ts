import { dayjs } from "metabase/dayjs";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { AnalysisSpec } from "../spec/types";

import {
  getRetentionCurvesData,
  getRetentionCurvesSettings,
} from "./retention-curves";

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

const cols = ["cohort", "offset", "cohort_size", "value"].map((name) =>
  createMockColumn({ name }),
);

describe("getRetentionCurvesData", () => {
  it("drops the periods a date cohort hasn't reached yet", () => {
    const lastWeek = dayjs().subtract(1, "week").startOf("week");
    const rows = [0, 1, 2, 3].map((offset) => [
      lastWeek.format("YYYY-MM-DD"),
      offset,
      10,
      0.5,
    ]);
    const data = getRetentionCurvesData(
      createMockDatasetData({ cols, rows }),
      "week",
    );
    expect(data.rows.map((row) => row[1])).toEqual([0, 1]);
  });

  it("keeps every period of an attribute cohort", () => {
    const rows = [0, 1, 2].map((offset) => ["Pro", offset, 10, 0.5]);
    const data = getRetentionCurvesData(
      createMockDatasetData({ cols, rows }),
      "week",
    );
    expect(data.rows).toHaveLength(3);
  });

  it("leaves other result shapes alone", () => {
    const data = createMockDatasetData({
      cols: [createMockColumn({ name: "x" })],
      rows: [[1]],
    });
    expect(getRetentionCurvesData(data, "week")).toBe(data);
  });
});

describe("getRetentionCurvesSettings", () => {
  it("draws a line per cohort over the period offsets", () => {
    const settings = getRetentionCurvesSettings(createSpec("week"));
    expect(settings["graph.dimensions"]).toEqual(["offset", "cohort"]);
    expect(settings["graph.metrics"]).toEqual(["value"]);
    expect(settings["graph.x_axis.scale"]).toBe("ordinal");
    expect(settings["graph.x_axis.title_text"]).toBe("Weeks since start");
  });

  it("formats percentages only when the table shows them", () => {
    expect(
      getRetentionCurvesSettings(createSpec("day", "percent")).column_settings,
    ).toBeDefined();
    expect(
      getRetentionCurvesSettings(createSpec("day", "counts")).column_settings,
    ).toBeUndefined();
  });
});
