import type { DatasetColumn, RawSeries } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import type { ComputedVisualizationSettings } from "../../types";

import { GRAPH_GOAL_SETTINGS } from "./goal";

describe("graph.goal_value widget", () => {
  const setting = GRAPH_GOAL_SETTINGS["graph.goal_value"];
  const metricColumn = createMockColumn({
    name: "count",
    base_type: "type/Integer",
  });
  const series: RawSeries = [
    createMockSingleSeries(
      {},
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "month", base_type: "type/Date" }),
            metricColumn,
          ],
        }),
      },
    ),
  ];
  const settings: ComputedVisualizationSettings = {
    "graph.metrics": ["count"],
    column: (column: DatasetColumn) => ({
      prefix: `${column.name}:`,
      scale: 2,
    }),
  };

  const getFormatOptions = (settings: ComputedVisualizationSettings) =>
    setting?.getProps?.(series, settings, jest.fn(), {}, jest.fn())
      ?.formatOptions;

  it("formats the goal like the y-axis, without scaling", () => {
    expect(getFormatOptions(settings)).toEqual({
      column: metricColumn,
      prefix: "count:",
      scale: undefined,
    });
  });

  it("formats a normalized stack goal as a percentage", () => {
    expect(
      getFormatOptions({ ...settings, "stackable.stack_type": "normalized" }),
    ).toEqual({
      column: metricColumn,
      number_style: "percent",
      scale: 0.01,
    });
  });

  it("does not format the goal without a metric column", () => {
    expect(getFormatOptions({ ...settings, "graph.metrics": [] })).toBe(
      undefined,
    );
  });
});
