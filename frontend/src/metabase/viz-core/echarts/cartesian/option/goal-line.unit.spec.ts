import {
  createMockCartesianChartModel,
  createMockChartContext,
} from "__support__/echarts";
import type { GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { X_AXIS_DATA_KEY } from "../constants/dataset";

import { getGoalLineParams, getGoalLineSeriesOption } from "./goal-line";

const renderingContext = createMockChartContext();

function getGoalLineData(
  goalValue: GoalValue | null,
  { isNormalized = false }: { isNormalized?: boolean } = {},
) {
  const chartModel = createMockCartesianChartModel({
    dataset: [{ [X_AXIS_DATA_KEY]: "foo", count: 1 }],
    leftAxisModel: isNormalized
      ? {
          seriesKeys: ["count"],
          extent: [0, 1],
          column: createMockColumn({ name: "count" }),
          formatter: String,
          formatGoal: String,
          splitNumber: 5,
          isNormalized,
        }
      : null,
  });
  const settings = createMockVisualizationSettings({
    "graph.show_goal": true,
    "graph.goal_value": goalValue,
  });

  return getGoalLineSeriesOption(
    getGoalLineParams(chartModel),
    settings,
    renderingContext,
  )?.data;
}

describe("getGoalLineSeriesOption", () => {
  it("draws the goal line at a static value", () => {
    expect(getGoalLineData(250)).toEqual([["foo", 250]]);
  });

  it("reads a normalized stack goal as a percentage", () => {
    expect(getGoalLineData(50, { isNormalized: true })).toEqual([["foo", 0.5]]);
  });

  it("draws nothing for an unresolved reference", () => {
    expect(
      getGoalLineData({ type: "card", id: 9, column: "goal" }),
    ).toBeUndefined();
    expect(getGoalLineData("count")).toBeUndefined();
  });

  it("draws nothing for an empty goal", () => {
    expect(getGoalLineData(null)).toBeUndefined();
  });
});
