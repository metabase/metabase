import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { isDynamicGoalSetting } from "../dynamic-goals";

import { validateGoalReferences } from "./validation";

jest.mock("../dynamic-goals", () => ({
  ...jest.requireActual("../dynamic-goals"),
  isDynamicGoalSetting: jest.fn(() => true),
}));

const isDynamicGoalSettingMock = jest.mocked(isDynamicGoalSetting);

const FAILED_DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[1]],
  referenced_entities: { card: { 9: { status: "failed", error: "boom" } } },
});

const REFERENCED_SETTINGS: VisualizationSettings = {
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

function series(data = FAILED_DATA): Series {
  return [createMockSingleSeries({ display: "line" }, { data })];
}

describe("validateGoalReferences", () => {
  afterEach(() => {
    isDynamicGoalSettingMock.mockReturnValue(true);
  });

  it("accepts a static goal", () => {
    expect(() =>
      validateGoalReferences(series(), { "graph.goal_value": 10 }),
    ).not.toThrow();
  });

  it("accepts a reference the data has not answered yet", () => {
    const data = createMockDatasetData({
      ...FAILED_DATA,
      referenced_entities: {},
    });

    expect(() =>
      validateGoalReferences(series(data), REFERENCED_SETTINGS),
    ).not.toThrow();
  });

  it("rejects a reference the data reports as failed", () => {
    expect(() => validateGoalReferences(series(), REFERENCED_SETTINGS)).toThrow(
      "Couldn't load the value this chart's goal line depends on.",
    );
  });

  it("reads the raw series when given a transformed one", () => {
    const transformedData = createMockDatasetData({
      ...FAILED_DATA,
      referenced_entities: undefined,
    });
    const transformed = Object.assign(series(transformedData), {
      _raw: series(),
    });

    expect(() =>
      validateGoalReferences(transformed, REFERENCED_SETTINGS),
    ).toThrow();
  });

  it("ignores references for a display that does not resolve goals", () => {
    isDynamicGoalSettingMock.mockReturnValue(false);

    expect(() =>
      validateGoalReferences(series(), REFERENCED_SETTINGS),
    ).not.toThrow();
  });
});
