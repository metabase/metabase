import type { DatetimeUnit, Series } from "metabase-types/api";
import {
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import type { ComputedVisualizationSettings } from "../types/computed-settings";

import { getTimeseriesXAxis } from "./timeseries-x-axis";

const createSeries = (
  dates: string[],
  unit: DatetimeUnit = "month",
): Series => [
  createMockSingleSeries(
    {},
    {
      data: {
        cols: [
          createMockDatetimeColumn({ name: "CREATED_AT", unit }),
          createMockNumericColumn({ name: "count" }),
        ],
        rows: dates.map((date, index) => [date, index]),
      },
    },
  ),
];

const TIMESERIES_SETTINGS: ComputedVisualizationSettings = {
  "graph.x_axis.scale": "timeseries",
  "graph.dimensions": ["CREATED_AT"],
  "graph.metrics": ["count"],
};

const ORDINAL_SETTINGS: ComputedVisualizationSettings = {
  ...TIMESERIES_SETTINGS,
  "graph.x_axis.scale": "ordinal",
};

const DATES = ["2024-03-01", "2024-01-01", "2024-02-01"];

describe("getTimeseriesXAxis", () => {
  it("returns the domain and the data interval of a timeseries chart", () => {
    const xAxis = getTimeseriesXAxis(createSeries(DATES), TIMESERIES_SETTINGS);
    expect(xAxis?.domain?.[0].format("YYYY-MM-DD")).toBe("2024-01-01");
    expect(xAxis?.domain?.[1].format("YYYY-MM-DD")).toBe("2024-03-01");
    expect(xAxis?.interval).toMatchObject({ count: 1, unit: "month" });
  });

  it("returns a null domain without rows", () => {
    expect(
      getTimeseriesXAxis(createSeries([]), TIMESERIES_SETTINGS)?.domain,
    ).toBeNull();
  });

  it("returns null when the x axis is not a timeseries", () => {
    expect(
      getTimeseriesXAxis(createSeries(DATES), ORDINAL_SETTINGS),
    ).toBeNull();
  });
});
