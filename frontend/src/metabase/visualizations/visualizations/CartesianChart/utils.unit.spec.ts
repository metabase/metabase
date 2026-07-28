import { createMockSeriesModel } from "__support__/echarts";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";

import { getClosestDatumIndex, getDataSeriesEChartsIndices } from "./utils";

describe("getDataSeriesEChartsIndices", () => {
  const seriesModels = [
    createMockSeriesModel({ dataKey: "1:count" }),
    createMockSeriesModel({ dataKey: "1:sum", visible: false }),
  ];

  it("returns ECharts indices of visible data series only", () => {
    const option = {
      series: [
        { id: "goal-line" },
        { id: "1:count" },
        { id: "1:sum" },
        { id: "timeline-event-selection" },
      ],
    };

    expect(getDataSeriesEChartsIndices(seriesModels, option)).toEqual([1]);
  });

  it("returns an empty array when no data series are present", () => {
    expect(
      getDataSeriesEChartsIndices(seriesModels, { series: [{ id: "other" }] }),
    ).toEqual([]);
  });
});

describe("getClosestDatumIndex", () => {
  const dataset = [
    { [X_AXIS_DATA_KEY]: "2027-05-01T00:00:00Z" },
    { [X_AXIS_DATA_KEY]: "2027-06-01T00:00:00Z" },
    { [X_AXIS_DATA_KEY]: "2027-07-01T00:00:00Z" },
  ];

  it("finds the datum matching the group date exactly", () => {
    expect(getClosestDatumIndex(dataset, "2027-06-01T00:00:00.000Z")).toBe(1);
  });

  it("finds the closest datum when x values carry a timezone offset", () => {
    const offsetDataset = [
      { [X_AXIS_DATA_KEY]: "2027-05-01T00:00:00+02:00" },
      { [X_AXIS_DATA_KEY]: "2027-06-01T00:00:00+02:00" },
    ];
    expect(getClosestDatumIndex(offsetDataset, "2027-06-01T00:00:00Z")).toBe(1);
  });

  it("matches day buckets exactly under the wall-clock-as-UTC encoding of extreme report timezones", () => {
    const dayDataset = [
      { [X_AXIS_DATA_KEY]: "2027-06-14T00:00:00Z" },
      { [X_AXIS_DATA_KEY]: "2027-06-15T00:00:00Z" },
      { [X_AXIS_DATA_KEY]: "2027-06-16T00:00:00Z" },
    ];
    expect(getClosestDatumIndex(dayDataset, "2027-06-15T00:00:00.000Z")).toBe(
      1,
    );
  });

  it("parses offset-less x values as UTC, independent of the browser timezone", () => {
    const offsetlessDataset = [
      { [X_AXIS_DATA_KEY]: "2027-06-14T00:00:00" },
      { [X_AXIS_DATA_KEY]: "2027-06-15T00:00:00" },
    ];
    expect(
      getClosestDatumIndex(offsetlessDataset, "2027-06-15T00:00:00Z"),
    ).toBe(1);
  });

  it("returns -1 for an unparsable date", () => {
    expect(getClosestDatumIndex(dataset, "not-a-date")).toBe(-1);
  });

  it("returns -1 for an empty dataset", () => {
    expect(getClosestDatumIndex([], "2027-06-01T00:00:00Z")).toBe(-1);
  });
});
