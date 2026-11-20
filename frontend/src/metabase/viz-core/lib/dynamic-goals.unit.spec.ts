import { DYNAMIC_GOAL_DISPLAYS } from "__support__/dynamic-goals";
import { color } from "metabase/ui/colors";
import type {
  GoalSourceResults,
  GoalValue,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
} from "metabase-types/api/mocks";

import type { GoalCard, GoalRefError } from "../types";

import {
  getChartGoalSources,
  getGoalErrorMessage,
  getGoalSegmentBounds,
  getGoalSources,
  getGoalValues,
  getNumericGoalValue,
  isDynamicGoalSetting,
  needsGraphGoalResolution,
  resolveGoalSegments,
  resolveGoalValue,
  resolveOpenEndedGoalSegments,
} from "./dynamic-goals";

const cols = [
  createMockColumn({ name: "value" }),
  createMockColumn({ name: "goal" }),
];

const rows = [[10, 42]];

const DATA = createMockDatasetData({ cols, rows });

const CARD_REF = { type: "card", id: 7, column: "total" } as const;

describe("resolveGoalValue", () => {
  it("returns a static number as-is", () => {
    expect(resolveGoalValue(DATA, {}, 5)).toEqual({ value: 5 });
  });

  it("resolves a self-column reference from the current rows", () => {
    expect(resolveGoalValue(DATA, {}, "goal")).toEqual({ value: 42 });
  });

  it("errors for a self-column reference when there are no rows", () => {
    const data = createMockDatasetData({ cols, rows: [] });

    expect(resolveGoalValue(data, {}, "goal")).toEqual({
      value: null,
      error: { column: "goal", reason: "not-a-number" },
    });
  });

  it("errors for a self-column reference when the cell is null", () => {
    const data = createMockDatasetData({ cols, rows: [[10, null]] });

    expect(resolveGoalValue(data, {}, "goal")).toEqual({
      value: null,
      error: { column: "goal", reason: "not-a-number" },
    });
  });

  it("errors for a self-column reference when the cell is not a number", () => {
    const data = createMockDatasetData({ cols, rows: [[10, "x"]] });

    expect(resolveGoalValue(data, {}, "goal")).toEqual({
      value: null,
      error: { column: "goal", reason: "not-a-number" },
    });
  });

  it("errors for a self-column reference that does not exist", () => {
    expect(resolveGoalValue(DATA, {}, "missing")).toEqual({
      value: null,
      error: { column: "missing", reason: "column-not-found" },
    });
  });

  it("resolves a card reference from the source results", () => {
    const sourceResults = createMockGoalSourceResults({
      id: 7,
      column: "total",
      value: 123,
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: 123,
    });
  });

  it("resolves a measure reference from the source results", () => {
    const sourceResults = createMockGoalSourceResults({
      type: "measure",
      id: 3,
      column: "avg",
      value: 55,
    });

    expect(
      resolveGoalValue(DATA, sourceResults, {
        type: "measure",
        id: 3,
        column: "avg",
      }),
    ).toEqual({ value: 55 });
  });

  it("does not resolve a card reference from the result of a measure with the same id", () => {
    const sourceResults = createMockGoalSourceResults({
      type: "measure",
      id: 7,
      column: "total",
      value: 123,
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed" },
    });
  });

  it("errors with query-failed when the source has no result, as it never ran", () => {
    expect(resolveGoalValue(DATA, {}, CARD_REF)).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed" },
    });
  });

  it("errors with the server's explanation when the source query failed", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error: "boom",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed", message: "boom" },
    });
  });

  it("errors with source-not-found when the source no longer exists", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error: "Not found.",
      error_type: "not-found",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF).error?.reason).toBe(
      "source-not-found",
    );
  });

  it("errors with has-parameters when the source question uses variables", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error: "Goal source card 7 uses variables, so it can't run on its own.",
      error_type: "has-parameters",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF).error?.reason).toBe(
      "has-parameters",
    );
  });

  it("errors with too-many-rows when the source query returned more than one row", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error: "Goal source card 7 returned more rows than the maximum of 1.",
      error_type: "too-many-rows",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF).error?.reason).toBe(
      "too-many-rows",
    );
  });

  it("treats a withheld goal as a failed query", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error_type: "withheld",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed", message: undefined },
    });
  });

  it("treats a source past the limit of sources as a failed query", () => {
    const sourceResults = createMockFailedGoalSourceResults({
      id: 7,
      error: "A chart can read at most 20 goal sources.",
      error_type: "too-many-sources",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: {
        ...CARD_REF,
        reason: "query-failed",
        message: "A chart can read at most 20 goal sources.",
      },
    });
  });

  it("errors when the source query returned no rows", () => {
    const sourceResults: GoalSourceResults = {
      card: {
        7: {
          status: "completed",
          data: { cols: [createMockColumn({ name: "total" })], rows: [] },
        },
      },
    };

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF).error?.reason).toBe(
      "not-a-number",
    );
  });

  it("resolves a source value of 0, which is not a missing value", () => {
    const sourceResults = createMockGoalSourceResults({
      id: 7,
      column: "total",
      value: 0,
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: 0,
    });
  });

  it("resolves a negative decimal source value", () => {
    const sourceResults = createMockGoalSourceResults({
      id: 7,
      column: "total",
      value: -12.5,
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: -12.5,
    });
  });

  it("errors for a column the source does not have", () => {
    const sourceResults = createMockGoalSourceResults({
      id: 7,
      column: "other",
      value: 1,
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: {
        ...CARD_REF,
        reason: "column-not-found",
        message: "Column not found",
      },
    });
  });

  it("errors when the source value is not a number", () => {
    const sourceResults = createMockGoalSourceResults({
      id: 7,
      column: "total",
      value: "nope",
    });

    expect(resolveGoalValue(DATA, sourceResults, CARD_REF)).toEqual({
      value: null,
      error: {
        ...CARD_REF,
        reason: "not-a-number",
        message: "Column value is not a number",
      },
    });
  });
});

describe("resolveGoalValue with a multi-column source", () => {
  const HIGH_REF = { type: "card", id: 9, column: "HIGH" } as const;

  it("resolves the referenced column rather than the first one", () => {
    const sourceResults = createMultiColumnSourceResults([[300, 600]]);

    expect(resolveGoalValue(DATA, sourceResults, HIGH_REF)).toEqual({
      value: 600,
    });
  });

  it("errors for a column the source no longer has, even though its other columns resolve", () => {
    const sourceResults = createMultiColumnSourceResults([[300, 600]]);

    expect(
      resolveGoalValue(DATA, sourceResults, { ...HIGH_REF, column: "MISSING" })
        .error?.reason,
    ).toBe("column-not-found");
  });

  it("errors when the referenced column is null, even though its other columns are numbers", () => {
    const sourceResults = createMultiColumnSourceResults([[300, null]]);

    expect(resolveGoalValue(DATA, sourceResults, HIGH_REF)).toEqual({
      value: null,
      error: {
        ...HIGH_REF,
        reason: "not-a-number",
        message: "Column value is not a number",
      },
    });
  });

  it("errors when the referenced column is text, even though its other columns are numbers", () => {
    const sourceResults = createMultiColumnSourceResults([[300, "text"]]);

    expect(resolveGoalValue(DATA, sourceResults, HIGH_REF).error?.reason).toBe(
      "not-a-number",
    );
  });

  it("errors when the source returned no rows", () => {
    const sourceResults = createMultiColumnSourceResults([]);

    expect(resolveGoalValue(DATA, sourceResults, HIGH_REF).error?.reason).toBe(
      "not-a-number",
    );
  });
});

describe("resolveGoalSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps static numeric segments", () => {
    const segments = resolveGoalSegments(DATA, {}, [
      { min: 0, max: 100, color: "red", label: "range" },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 100, color: "red", label: "range" },
    ]);
  });

  it("gives a legacy segment without a color a default fill", () => {
    const segments = resolveGoalSegments(DATA, {}, [{ min: 0, max: 100 }]);

    expect(segments).toEqual([
      { min: 0, max: 100, color: color("text-secondary"), label: undefined },
    ]);
  });

  it("gives a legacy segment with a null color a default fill", () => {
    const segments = resolveGoalSegments(DATA, {}, [
      { min: 0, max: 100, color: null },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 100, color: color("text-secondary"), label: undefined },
    ]);
  });

  it("takes the default fill from the given color getter", () => {
    const getColor = jest.fn(() => "#123456");
    const segments = resolveGoalSegments(
      DATA,
      {},
      [{ min: 0, max: 100 }],
      getColor,
    );

    expect(getColor).toHaveBeenCalledWith("text-secondary");
    expect(segments).toEqual([
      { min: 0, max: 100, color: "#123456", label: undefined },
    ]);
  });

  it("resolves a foreign card reference from the source results", () => {
    const sourceResults = createMockGoalSourceResults({
      column: "goal",
      value: 250,
    });

    const segments = resolveGoalSegments(DATA, sourceResults, [
      { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "green" },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 250, color: "green", label: undefined },
    ]);
  });

  it("resolves a foreign measure reference from the source results", () => {
    const sourceResults = createMockGoalSourceResults({
      type: "measure",
      id: 4,
      column: "goal",
      value: 250,
    });

    const segments = resolveGoalSegments(DATA, sourceResults, [
      {
        min: 0,
        max: { type: "measure", id: 4, column: "goal" },
        color: "green",
      },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 250, color: "green", label: undefined },
    ]);
  });

  it("drops segments with a card reference that fails to resolve", () => {
    const segments = resolveGoalSegments(
      DATA,
      createMockFailedGoalSourceResults(),
      [
        {
          min: 0,
          max: { type: "card", id: 9, column: "goal" },
          color: "green",
        },
      ],
    );

    expect(segments).toEqual([]);
  });

  it("drops segments with a measure reference that fails to resolve", () => {
    const segments = resolveGoalSegments(
      DATA,
      createMockFailedGoalSourceResults({ type: "measure", id: 4 }),
      [
        {
          min: 0,
          max: { type: "measure", id: 4, column: "goal" },
          color: "green",
        },
      ],
    );

    expect(segments).toEqual([]);
  });
});

describe("resolveOpenEndedGoalSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps a bound left empty open", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, {}, [
      { min: null, max: 10, color: "red", label: "low" },
      { min: 10, max: 100, color: "yellow", label: "mid" },
      { min: 100, max: null, color: "green", label: "high" },
    ]);

    expect(segments).toEqual([
      { min: null, max: 10, color: "red", label: "low" },
      { min: 10, max: 100, color: "yellow", label: "mid" },
      { min: 100, max: null, color: "green", label: "high" },
    ]);
  });

  it("drops a segment with both bounds empty", () => {
    expect(
      resolveOpenEndedGoalSegments(DATA, {}, [
        { min: null, max: null, color: "red" },
      ]),
    ).toEqual([]);
  });

  it("resolves a self-column bound against the first row", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, {}, [
      { min: "value", max: null, color: "green" },
    ]);

    expect(segments).toEqual([
      { min: 50, max: null, color: "green", label: undefined },
    ]);
  });

  it("resolves a foreign reference next to an open bound", () => {
    const sourceResults = createMockGoalSourceResults({
      type: "measure",
      id: 4,
      column: "goal",
      value: 250,
    });

    const segments = resolveOpenEndedGoalSegments(DATA, sourceResults, [
      {
        min: { type: "measure", id: 4, column: "goal" },
        max: null,
        color: "green",
      },
    ]);

    expect(segments).toEqual([
      { min: 250, max: null, color: "green", label: undefined },
    ]);
  });

  it("treats a bound that failed to resolve as unset", () => {
    const segments = resolveOpenEndedGoalSegments(
      DATA,
      createMockFailedGoalSourceResults(),
      [
        {
          min: { type: "card", id: 9, column: "goal" },
          max: null,
          color: "green",
        },
        { min: "missing", max: 100, color: "red" },
        {
          min: null,
          max: { type: "card", id: 9, column: "goal" },
          color: "blue",
        },
      ],
    );

    expect(segments).toEqual([
      { min: null, max: 100, color: "red", label: undefined },
    ]);
  });

  it("drops a segment whose only set bound reads a source without a result", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, {}, [
      {
        min: null,
        max: { type: "card", id: 9, column: "goal" },
        color: "green",
      },
    ]);

    expect(segments).toEqual([]);
  });

  it("gives a segment without a color the default fill", () => {
    const getColor = jest.fn(() => "#123456");

    expect(
      resolveOpenEndedGoalSegments(DATA, {}, [{ min: 0, max: null }], getColor),
    ).toEqual([{ min: 0, max: null, color: "#123456", label: undefined }]);
  });
});

describe("getGoalErrorMessage", () => {
  const REF = { type: "card", id: 9, column: "goal" } as const;

  it("shows the server's explanation of a failed query", () => {
    expect(
      getGoalErrorMessage({ ...REF, reason: "query-failed", message: "boom" }),
    ).toBe("boom");
  });

  it("falls back to a generic message for a failed query", () => {
    expect(getGoalErrorMessage({ ...REF, reason: "query-failed" })).toBe(
      "Couldn't load this value",
    );
  });

  it("names the kind of a source that no longer exists", () => {
    const error: GoalRefError = {
      ...REF,
      reason: "source-not-found",
      message: "Not found.",
    };

    expect(getGoalErrorMessage(error, "question")).toBe(
      "This question no longer exists",
    );
    expect(getGoalErrorMessage(error, "model")).toBe(
      "This model no longer exists",
    );
    expect(getGoalErrorMessage(error, "metric")).toBe(
      "This metric no longer exists",
    );
    expect(getGoalErrorMessage(error, "measure")).toBe(
      "This measure no longer exists",
    );
  });

  it("falls back to a generic message for a missing source of an unknown kind", () => {
    expect(
      getGoalErrorMessage({
        ...REF,
        reason: "source-not-found",
        message: "Not found.",
      }),
    ).toBe("This source no longer exists");
  });

  it("explains that a source with variables can't be a goal, whatever the server says", () => {
    const error: GoalRefError = {
      ...REF,
      reason: "has-parameters",
      message: "Goal source card 9 uses variables, so it can't run on its own.",
    };

    expect(getGoalErrorMessage(error, "question")).toBe(
      "This question uses variables, directly or through a question it's built on. A goal runs on its own and can't fill them in, so pick a question without variables.",
    );
    expect(getGoalErrorMessage(error, "model")).toBe(
      "This model is built on a question that uses variables. A goal runs on its own and can't fill them in, so pick a source without variables.",
    );
    expect(getGoalErrorMessage(error, "metric")).toBe(
      "This metric is built on a question that uses variables. A goal runs on its own and can't fill them in, so pick a source without variables.",
    );
    expect(getGoalErrorMessage(error)).toBe(
      "This source uses variables. A goal runs on its own and can't fill them in, so pick a source without variables.",
    );
  });

  it("explains a missing column regardless of the server message", () => {
    expect(
      getGoalErrorMessage({
        ...REF,
        reason: "column-not-found",
        message: "boom",
      }),
    ).toBe("This column no longer exists");
  });

  it("explains a non-numeric value regardless of the server message", () => {
    expect(
      getGoalErrorMessage({ ...REF, reason: "not-a-number", message: "boom" }),
    ).toBe("This value isn't a number");
  });
});

describe("getGoalSources", () => {
  it("returns no sources for static, self-column and empty values", () => {
    expect(getGoalSources([100, "value", null, undefined])).toEqual([]);
  });

  it("returns one source per entity, without the column", () => {
    expect(
      getGoalSources([
        { type: "card", id: 1, column: "sum" },
        { type: "card", id: 1, column: "total" },
        { type: "measure", id: 1, column: "avg" },
      ]),
    ).toEqual([
      { type: "card", id: 1 },
      { type: "measure", id: 1 },
    ]);
  });

  it("orders sources by type, then by id, whatever order the values come in", () => {
    expect(
      getGoalSources([
        { type: "measure", id: 3, column: "avg" },
        { type: "card", id: 10, column: "sum" },
        { type: "measure", id: 1, column: "avg" },
        { type: "card", id: 2, column: "sum" },
      ]),
    ).toEqual([
      { type: "card", id: 2 },
      { type: "card", id: 10 },
      { type: "measure", id: 1 },
      { type: "measure", id: 3 },
    ]);
  });
});

describe("getChartGoalSources", () => {
  it("returns no sources when there are no settings", () => {
    expect(getChartGoalSources(gaugeCard({}))).toEqual([]);
    expect(getChartGoalSources({ display: "gauge" })).toEqual([]);
  });

  it("returns no sources when there are no foreign references", () => {
    const card = gaugeCard({
      "gauge.segments": [{ min: 0, max: "goal", color: "red" }],
    });

    expect(getChartGoalSources(card)).toEqual([]);
  });

  it("collects the sources of a gauge chart's ranges", () => {
    const card = gaugeCard({
      "gauge.segments": [
        { min: { type: "card", id: 1, column: "sum" }, max: 100, color: "red" },
        {
          min: { type: "measure", id: 2, column: "avg" },
          max: { type: "card", id: 1, column: "total" },
          color: "green",
        },
      ],
    });

    expect(getChartGoalSources(card)).toEqual([
      { type: "card", id: 1 },
      { type: "measure", id: 2 },
    ]);
  });

  it("collects the sources of a number chart's color ranges", () => {
    const card: GoalCard = {
      display: "scalar",
      visualization_settings: {
        "scalar.segments": [
          { min: null, max: "count", color: "red" },
          {
            min: { type: "card", id: 1, column: "sum" },
            max: null,
            color: "yellow",
          },
        ],
      },
    };

    expect(getChartGoalSources(card)).toEqual([{ type: "card", id: 1 }]);
  });

  it("collects the source of a progress chart's goal", () => {
    const card: GoalCard = {
      display: "progress",
      visualization_settings: {
        "progress.goal": { type: "measure", id: 2, column: "sum" },
      },
    };

    expect(getChartGoalSources(card)).toEqual([{ type: "measure", id: 2 }]);
  });

  it("collects the source of a shown goal line", () => {
    const card: GoalCard = {
      display: "line",
      visualization_settings: {
        "graph.show_goal": true,
        "graph.goal_value": { type: "card", id: 9, column: "goal" },
      },
    };

    expect(getChartGoalSources(card)).toEqual([{ type: "card", id: 9 }]);
  });

  it("ignores the source of a hidden goal line", () => {
    const card: GoalCard = {
      display: "line",
      visualization_settings: {
        "graph.show_goal": false,
        "graph.goal_value": { type: "card", id: 9, column: "goal" },
      },
    };

    expect(getChartGoalSources(card)).toEqual([]);
  });

  it("ignores a goal line on a display without one", () => {
    const card: GoalCard = {
      display: "table",
      visualization_settings: {
        "graph.show_goal": true,
        "graph.goal_value": { type: "card", id: 9, column: "goal" },
      },
    };

    expect(getChartGoalSources(card)).toEqual([]);
  });
});

describe("malformed persisted segments", () => {
  const data = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  const malformedSettings = [
    { name: "a null segment", settings: { "gauge.segments": [null] } },
    { name: "a non-object segment", settings: { "gauge.segments": [5] } },
    { name: "a non-array value", settings: { "gauge.segments": 5 } },
    {
      name: "a segment with malformed bounds",
      settings: { "gauge.segments": [{ min: {}, max: [1], color: "red" }] },
    },
  ].map(({ name, settings }) => ({
    name,
    // deliberately malformed input
    settings: settings as unknown as VisualizationSettings,
  }));

  it.each(malformedSettings)("tolerates $name", ({ settings }) => {
    const segments = settings["gauge.segments"];

    expect(resolveGoalSegments(data, {}, segments)).toEqual([]);
    expect(getGoalSources(getGoalSegmentBounds(segments))).toEqual([]);
    expect(getChartGoalSources(gaugeCard(settings))).toEqual([]);
  });

  it("keeps the valid segments and drops the rest", () => {
    // deliberately malformed input
    const segments = [
      null,
      { min: 0, max: 100, color: "red" },
    ] as unknown as VisualizationSettings["gauge.segments"];

    expect(resolveGoalSegments(data, {}, segments)).toEqual([
      { min: 0, max: 100, color: "red", label: undefined },
    ]);
  });
});

describe("dynamic goal settings per display", () => {
  it("knows which settings a display resolves", () => {
    expect(isDynamicGoalSetting("area", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("area", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("bar", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("bar", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("boxplot", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("boxplot", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("combo", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("combo", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("gauge", "gauge.segments")).toBe(true);
    expect(isDynamicGoalSetting("gauge", "graph.goal_value")).toBe(false);
    expect(isDynamicGoalSetting("line", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("line", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("progress", "progress.goal")).toBe(true);
    expect(isDynamicGoalSetting("progress", "graph.goal_value")).toBe(false);
    expect(isDynamicGoalSetting("row", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("row", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("scalar", "scalar.segments")).toBe(true);
    expect(isDynamicGoalSetting("scalar", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("scatter", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("scatter", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting("waterfall", "graph.goal_value")).toBe(true);
    expect(isDynamicGoalSetting("waterfall", "gauge.segments")).toBe(false);
    expect(isDynamicGoalSetting(undefined, "graph.goal_value")).toBe(false);
  });

  it("ignores goal references of settings the display does not resolve", () => {
    const card: GoalCard = {
      display: "scalar",
      visualization_settings: {
        "progress.goal": { type: "card", id: 1, column: "sum" },
      },
    };

    expect(getChartGoalSources(card)).toEqual([]);
  });
});

describe("needsGraphGoalResolution", () => {
  const ref = { type: "card" as const, id: 1, column: "sum" };

  function shownGoal(
    goal: GoalValue | null | undefined,
  ): VisualizationSettings {
    return { "graph.show_goal": true, "graph.goal_value": goal };
  }

  it("is false for a reference on a display that does not resolve graph goals", () => {
    expect(needsGraphGoalResolution("scalar", shownGoal(ref))).toBe(false);
    expect(needsGraphGoalResolution("scalar", shownGoal("count"))).toBe(false);
    expect(needsGraphGoalResolution("gauge", shownGoal(ref))).toBe(false);
    expect(needsGraphGoalResolution(undefined, shownGoal(ref))).toBe(false);
  });

  describe.each(DYNAMIC_GOAL_DISPLAYS)("for a %s chart", (display) => {
    it("is true for a shown reference", () => {
      expect(needsGraphGoalResolution(display, shownGoal(ref))).toBe(true);
      expect(needsGraphGoalResolution(display, shownGoal("count"))).toBe(true);
    });

    it("is false for unset and static goals", () => {
      expect(needsGraphGoalResolution(display, shownGoal(null))).toBe(false);
      expect(needsGraphGoalResolution(display, shownGoal(undefined))).toBe(
        false,
      );
      expect(needsGraphGoalResolution(display, shownGoal(10))).toBe(false);
    });

    it("is false when the goal line is hidden", () => {
      expect(
        needsGraphGoalResolution(display, { "graph.goal_value": ref }),
      ).toBe(false);
      expect(
        needsGraphGoalResolution(display, {
          "graph.show_goal": false,
          "graph.goal_value": ref,
        }),
      ).toBe(false);
    });
  });
});

describe("getGoalValues", () => {
  const settings: VisualizationSettings = {
    "graph.show_goal": true,
    "graph.goal_value": 7,
    "progress.goal": { type: "card", id: 1, column: "sum" },
    "gauge.segments": [
      { min: 0, max: { type: "measure", id: 2, column: "avg" }, color: "red" },
      { min: null, max: 50, color: "blue" },
    ],
    "scalar.segments": [{ min: 10, max: null, color: "green" }],
  };

  it("reads single-value settings, skipping absent ones", () => {
    expect(
      getGoalValues(settings, ["graph.goal_value", "progress.goal"]),
    ).toEqual([7, { type: "card", id: 1, column: "sum" }]);
    expect(getGoalValues({}, ["graph.goal_value", "progress.goal"])).toEqual(
      [],
    );
  });

  it("skips the goal line value when the goal line is hidden", () => {
    const hidden = { ...settings, "graph.show_goal": false };

    expect(getGoalValues(hidden, ["graph.goal_value"])).toEqual([]);
    expect(getGoalValues(hidden, ["progress.goal"])).toEqual([
      { type: "card", id: 1, column: "sum" },
    ]);
  });

  it("reads the non-empty bounds of segment settings", () => {
    expect(
      getGoalValues(settings, ["gauge.segments", "scalar.segments"]),
    ).toEqual([0, { type: "measure", id: 2, column: "avg" }, 50, 10]);
  });

  it("skips absent and malformed settings", () => {
    // deliberately malformed input
    const malformed = {
      "graph.show_goal": true,
      "graph.goal_value": { id: 1 },
      "scalar.segments": 5,
    } as unknown as VisualizationSettings;

    expect(
      getGoalValues(malformed, [
        "graph.goal_value",
        "progress.goal",
        "scalar.segments",
      ]),
    ).toEqual([]);
  });
});

describe("getNumericGoalValue", () => {
  it("returns a static goal", () => {
    expect(getNumericGoalValue({ "graph.goal_value": 42 })).toBe(42);
    expect(getNumericGoalValue({ "graph.goal_value": 0 })).toBe(0);
  });

  it("returns null for an unset goal", () => {
    expect(getNumericGoalValue({})).toBeNull();
    expect(getNumericGoalValue({ "graph.goal_value": null })).toBeNull();
  });

  it("returns null for an unresolved reference", () => {
    expect(getNumericGoalValue({ "graph.goal_value": "count" })).toBeNull();
    expect(
      getNumericGoalValue({
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      }),
    ).toBeNull();
  });
});

function gaugeCard(visualization_settings: VisualizationSettings): GoalCard {
  return { display: "gauge", visualization_settings };
}

function createMultiColumnSourceResults(rows: RowValue[][]): GoalSourceResults {
  return {
    card: {
      9: {
        status: "completed",
        data: {
          cols: [
            createMockColumn({ name: "LOW" }),
            createMockColumn({ name: "HIGH" }),
          ],
          rows,
        },
      },
    },
  };
}
