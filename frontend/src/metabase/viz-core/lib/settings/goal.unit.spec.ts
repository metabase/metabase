import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import type { ComputedVisualizationSettings } from "../../types";

import { GRAPH_GOAL_SETTINGS, getChartGoal } from "./goal";

describe("getChartGoal", () => {
  const settings: VisualizationSettings = {
    "graph.show_goal": true,
    "graph.goal_value": 50,
    "graph.goal_label": "Target",
  };

  it("returns nothing when the goal line is off", () => {
    expect(getChartGoal({ ...settings, "graph.show_goal": false })).toBeNull();
  });

  it("returns the goal with its label", () => {
    expect(getChartGoal(settings)).toEqual({ value: 50, label: "Target" });
  });

  it("reads a normalized stack goal as a percentage", () => {
    expect(
      getChartGoal({ ...settings, "stackable.stack_type": "normalized" }),
    ).toEqual({ value: 0.5, label: "Target" });
  });

  it("draws an unset goal at 0", () => {
    expect(getChartGoal({ ...settings, "graph.goal_value": null })).toEqual({
      value: 0,
      label: "Target",
    });
    expect(
      getChartGoal({ ...settings, "graph.goal_value": undefined }),
    ).toEqual({ value: 0, label: "Target" });
  });

  it("returns nothing for an unresolved reference", () => {
    expect(
      getChartGoal({
        ...settings,
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      }),
    ).toBeNull();
  });
});

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
