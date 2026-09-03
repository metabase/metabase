import { color } from "metabase/ui/colors";
import type { GoalSegment, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { GoalCard } from "./dynamic-goals";
import {
  getDynamicGoalSettingKeys,
  getGoalValuesFromVizSettings,
  getReferencedEntities,
  getUnansweredGoalEntities,
  getUnansweredGoalEntitiesForValues,
  hasFailedGoalReferences,
  hasFailedGoalReferencesForValues,
  hasUnansweredGoalReferences,
  hasUnresolvedGoalReferences,
  isDynamicGoalSetting,
  resolveGoalSegments,
  resolveGoalValue,
  resolveOpenEndedGoalSegments,
  supportsDynamicGoals,
} from "./dynamic-goals";

const cols = [
  createMockColumn({ name: "value" }),
  createMockColumn({ name: "goal" }),
];

const rows = [[10, 42]];

describe("resolveGoalValue", () => {
  it("returns a static number as-is", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue(data, 5);

    expect(goalValue).toEqual({ value: 5 });
  });

  it("resolves a self-column reference from the current rows", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue(data, "goal");

    expect(goalValue).toEqual({ value: 42 });
  });

  it("errors for a self-column reference that does not exist", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue(data, "missing");

    expect(goalValue).toEqual({
      value: null,
      error: {
        column: "missing",
        reason: "column-not-found",
      },
    });
  });

  it("resolves a card reference from referenced_entities", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {
        card: {
          7: {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "total" })],
              rows: [[123]],
            },
          },
        },
      },
    });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({
      value: 123,
    });
  });

  it("resolves a measure reference from referenced_entities", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {
        measure: {
          3: {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "avg" })],
              rows: [[55]],
            },
          },
        },
      },
    });
    const goalValue = resolveGoalValue(data, {
      type: "measure",
      id: 3,
      column: "avg",
    });

    expect(goalValue).toEqual({
      value: 55,
    });
  });

  it("errors with the server's explanation when the referenced query failed", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {
        card: {
          7: {
            status: "failed",
            error: "boom",
          },
        },
      },
    });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({
      value: null,
      error: {
        type: "card",
        id: 7,
        column: "total",
        reason: "query-failed",
        message: "boom",
      },
    });
  });

  it("is resolving when the referenced entity is absent from the response", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {},
    });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({ value: null, isUnanswered: true });
  });

  it("is resolving while referenced results are unavailable", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({ value: null, isUnanswered: true });
  });

  it("errors for a foreign column reference that does not exist", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {
        card: {
          7: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "other" })], rows: [[1]] },
          },
        },
      },
    });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({
      value: null,
      error: {
        column: "total",
        id: 7,
        message: "Column not found",
        reason: "column-not-found",
        type: "card",
      },
    });
  });

  it("errors when the referenced value is not a number", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {
        card: {
          7: {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "total" })],
              rows: [["nope"]],
            },
          },
        },
      },
    });
    const goalValue = resolveGoalValue(data, {
      type: "card",
      id: 7,
      column: "total",
    });

    expect(goalValue).toEqual({
      value: null,
      error: {
        type: "card",
        id: 7,
        column: "total",
        reason: "not-a-number",
        message: "Column value is not a number",
      },
    });
  });
});

describe("resolveGoalSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps static numeric segments", () => {
    const segments = resolveGoalSegments(DATA, [
      { min: 0, max: 100, color: "red", label: "range" },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 100, color: "red", label: "range" },
    ]);
  });

  it("gives a legacy segment without a color a default fill", () => {
    const segments = resolveGoalSegments(DATA, [{ min: 0, max: 100 }]);

    expect(segments).toEqual([
      { min: 0, max: 100, color: color("text-secondary"), label: undefined },
    ]);
  });

  it("gives a legacy segment with a null color a default fill", () => {
    const segments = resolveGoalSegments(DATA, [
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
      [{ min: 0, max: 100 }],
      getColor,
    );

    expect(getColor).toHaveBeenCalledWith("text-secondary");
    expect(segments).toEqual([
      { min: 0, max: 100, color: "#123456", label: undefined },
    ]);
  });

  it("resolves a foreign card reference from referenced_entities", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      },
    });

    const segments = resolveGoalSegments(data, [
      {
        min: 0,
        max: { type: "card", id: 9, column: "goal" },
        color: "green",
      },
    ]);

    expect(segments).toEqual([
      { min: 0, max: 250, color: "green", label: undefined },
    ]);
  });

  it("resolves a foreign measure reference from referenced_entities", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        measure: {
          4: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      },
    });

    const segments = resolveGoalSegments(data, [
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

  it("drops segments with a card reference that fail to resolve", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });
    const segments = resolveGoalSegments(data, [
      {
        min: 0,
        max: { type: "card", id: 9, column: "goal" },
        color: "green",
      },
    ]);

    expect(segments).toEqual([]);
  });

  it("drops segments with a measure reference that fails to resolve", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        measure: { 4: { status: "failed", error: "boom" } },
      },
    });
    const segments = resolveGoalSegments(data, [
      {
        min: 0,
        max: { type: "measure", id: 4, column: "goal" },
        color: "green",
      },
    ]);

    expect(segments).toEqual([]);
  });
});

describe("resolveOpenEndedGoalSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps a bound left empty open", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, [
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
      resolveOpenEndedGoalSegments(DATA, [
        { min: null, max: null, color: "red" },
      ]),
    ).toEqual([]);
  });

  it("resolves a self-column bound against the first row", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, [
      { min: "value", max: null, color: "green" },
    ]);

    expect(segments).toEqual([
      { min: 50, max: null, color: "green", label: undefined },
    ]);
  });

  it("resolves a foreign reference next to an open bound", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        measure: {
          4: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      },
    });

    const segments = resolveOpenEndedGoalSegments(data, [
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

  it("drops a segment whose set bound failed to resolve instead of treating it as open", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    const segments = resolveOpenEndedGoalSegments(data, [
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
    ]);

    expect(segments).toEqual([]);
  });

  it("drops a segment whose set bound is still unanswered", () => {
    const segments = resolveOpenEndedGoalSegments(DATA, [
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
      resolveOpenEndedGoalSegments(DATA, [{ min: 0, max: null }], getColor),
    ).toEqual([{ min: 0, max: null, color: "#123456", label: undefined }]);
  });
});

describe("hasFailedGoalReferences", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });
  const SEGMENTS: GoalSegment[] = [
    { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
  ];

  it("is false when every bound resolves", () => {
    expect(
      hasFailedGoalReferences(DATA, [{ min: 0, max: 100, color: "red" }]),
    ).toBe(false);
  });

  it("is false while a reference is still unanswered", () => {
    expect(hasFailedGoalReferences(DATA, SEGMENTS)).toBe(false);
  });

  it("is false when a foreign answer lacks the column: it gets re-asked", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "other" })], rows: [[1]] },
          },
        },
      },
    });

    expect(hasFailedGoalReferences(data, SEGMENTS)).toBe(false);
  });

  it("is true when the referenced query failed", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    expect(hasFailedGoalReferences(data, SEGMENTS)).toBe(true);
  });

  it("is true when the referenced value is not a number", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [["x"]] },
          },
        },
      },
    });

    expect(hasFailedGoalReferences(data, SEGMENTS)).toBe(true);
  });

  it("is true for a self-column reference to a missing column: nothing re-asks it", () => {
    expect(
      hasFailedGoalReferences(DATA, [{ min: 0, max: "missing", color: "red" }]),
    ).toBe(true);
  });
});

function gaugeCard(visualization_settings: VisualizationSettings): GoalCard {
  return { display: "gauge", visualization_settings };
}

describe("getReferencedEntities", () => {
  it("returns no referenced entities when there are no settings", () => {
    expect(getReferencedEntities(gaugeCard({}))).toEqual([]);
  });

  it("returns no referenced entities when there are no foreign references", () => {
    const referencedEntities = getReferencedEntities(
      gaugeCard({
        "gauge.segments": [{ min: 0, max: "goal", color: "red" }],
      }),
    );

    expect(referencedEntities).toEqual([]);
  });

  it("collects and dedupes referenced columns per entity", () => {
    const referencedEntities = getReferencedEntities(
      gaugeCard({
        "gauge.segments": [
          {
            min: { type: "card", id: 1, column: "sum" },
            max: 100,
            color: "red",
          },
          {
            min: 100,
            max: { type: "card", id: 1, column: "total" },
            color: "yellow",
          },
          {
            min: { type: "measure", id: 1, column: "avg" },
            max: { type: "card", id: 1, column: "sum" },
            color: "green",
          },
        ],
      }),
    );

    expect(referencedEntities).toEqual([
      { type: "card", id: 1, columns: ["sum", "total"] },
      { type: "measure", id: 1, columns: ["avg"] },
    ]);
  });

  it("ignores segments with empty bounds", () => {
    const referencedEntities = getReferencedEntities(
      gaugeCard({
        "gauge.segments": [{ min: null, max: null, color: "red" }],
      }),
    );

    expect(referencedEntities).toEqual([]);
  });

  it("collects the references of a number chart's color ranges", () => {
    const referencedEntities = getReferencedEntities({
      display: "scalar",
      visualization_settings: {
        "scalar.segments": [
          { min: null, max: "count", color: "red" },
          {
            min: { type: "card", id: 1, column: "sum" },
            max: { type: "measure", id: 2, column: "avg" },
            color: "yellow",
          },
          {
            min: { type: "card", id: 1, column: "total" },
            max: null,
            color: "green",
          },
        ],
      },
    });

    expect(referencedEntities).toEqual([
      { type: "card", id: 1, columns: ["sum", "total"] },
      { type: "measure", id: 2, columns: ["avg"] },
    ]);
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

    expect(resolveGoalSegments(data, segments)).toEqual([]);
    expect(hasFailedGoalReferences(data, segments)).toBe(false);
    expect(getUnansweredGoalEntities(data, segments)).toEqual([]);
    expect(getReferencedEntities(gaugeCard(settings))).toEqual([]);
  });

  it("keeps the valid segments and drops the rest", () => {
    // deliberately malformed input
    const segments = [
      null,
      { min: 0, max: 100, color: "red" },
    ] as unknown as VisualizationSettings["gauge.segments"];

    expect(resolveGoalSegments(data, segments)).toEqual([
      { min: 0, max: 100, color: "red", label: undefined },
    ]);
  });
});

describe("getUnansweredGoalEntities", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });
  const SEGMENTS = [
    {
      min: { type: "card", id: 9, column: "goal" },
      max: { type: "card", id: 9, column: "target" },
      color: "red",
    } as const,
    {
      min: 0,
      max: { type: "measure", id: 4, column: "sum" },
      color: "green",
    } as const,
  ];

  it("returns the distinct entities the dataset has no answer for", () => {
    expect(getUnansweredGoalEntities(DATA, SEGMENTS)).toEqual([
      { type: "card", id: 9 },
      { type: "measure", id: 4 },
    ]);
  });

  it("skips entities that resolved", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: {
              cols: [
                createMockColumn({ name: "goal" }),
                createMockColumn({ name: "target" }),
              ],
              rows: [[250, 300]],
            },
          },
        },
      },
    });

    expect(getUnansweredGoalEntities(data, SEGMENTS)).toEqual([
      { type: "measure", id: 4 },
    ]);
  });

  it("includes entities whose answer is missing a referenced column", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "goal" })],
              rows: [[250]],
            },
          },
        },
        measure: {
          4: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "sum" })], rows: [[10]] },
          },
        },
      },
    });

    expect(getUnansweredGoalEntities(data, SEGMENTS)).toEqual([
      { type: "card", id: 9 },
    ]);
  });

  it("skips entities that failed: the dataset answered them", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
        measure: { 4: { status: "failed", error: "boom" } },
      },
    });

    expect(getUnansweredGoalEntities(data, SEGMENTS)).toEqual([]);
  });
});

describe("hasUnansweredGoalReferences", () => {
  const settings: VisualizationSettings = {
    "gauge.segments": [
      { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
    ],
  };
  const gauge: GoalCard = {
    display: "gauge",
    visualization_settings: settings,
  };
  const baseData = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("ignores references on a display without dynamic goals", () => {
    const card: GoalCard = {
      display: "table",
      visualization_settings: settings,
    };

    expect(hasUnansweredGoalReferences(card, undefined)).toBe(false);
  });

  it("returns true without any result data", () => {
    expect(hasUnansweredGoalReferences(gauge, undefined)).toBe(true);
  });

  it("returns true when the result lacks the referenced entity", () => {
    expect(hasUnansweredGoalReferences(gauge, baseData)).toBe(true);
  });

  it("returns false when the reference resolved", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      },
    });

    expect(hasUnansweredGoalReferences(gauge, data)).toBe(false);
  });

  it("returns false for a failed reference: the result answered it", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    expect(hasUnansweredGoalReferences(gauge, data)).toBe(false);
  });

  it("returns false without foreign references", () => {
    const card: GoalCard = {
      ...gauge,
      visualization_settings: {
        "gauge.segments": [{ min: 0, max: 100, color: "red" }],
      },
    };

    expect(hasUnansweredGoalReferences(card, undefined)).toBe(false);
  });
});

describe("hasUnresolvedGoalReferences", () => {
  const gauge: GoalCard = {
    display: "gauge",
    visualization_settings: {
      "gauge.segments": [
        { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
      ],
    },
  };
  const baseData = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("ignores references on a display without dynamic goals", () => {
    const card: GoalCard = {
      display: "table",
      visualization_settings: {
        "gauge.segments": [
          {
            min: 0,
            max: { type: "card", id: 9, column: "goal" },
            color: "red",
          },
        ],
      },
    };

    expect(hasUnresolvedGoalReferences(card, undefined)).toBe(false);
  });

  it("is true without any result data", () => {
    expect(hasUnresolvedGoalReferences(gauge, undefined)).toBe(true);
  });

  it("is true for a failed reference, so it gets retried", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    expect(hasUnresolvedGoalReferences(gauge, data)).toBe(true);
  });

  it("is true when the referenced column is missing from the entity's answer", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "other" })], rows: [[1]] },
          },
        },
      },
    });

    expect(hasUnresolvedGoalReferences(gauge, data)).toBe(true);
  });

  it("is false when every reference resolved", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      },
    });

    expect(hasUnresolvedGoalReferences(gauge, data)).toBe(false);
  });
});

describe("dynamic goal settings per display", () => {
  it("knows which settings a display resolves", () => {
    expect(getDynamicGoalSettingKeys("gauge")).toEqual(["gauge.segments"]);
    expect(supportsDynamicGoals("gauge")).toBe(true);
    expect(isDynamicGoalSetting("gauge", "gauge.segments")).toBe(true);
    expect(isDynamicGoalSetting("gauge", "graph.goal_value")).toBe(false);

    expect(getDynamicGoalSettingKeys("scalar")).toEqual(["scalar.segments"]);
    expect(supportsDynamicGoals("scalar")).toBe(true);
    expect(isDynamicGoalSetting("scalar", "scalar.segments")).toBe(true);
    expect(isDynamicGoalSetting("scalar", "gauge.segments")).toBe(false);
  });

  it("treats displays without dynamic goals, and no display, as unsupported", () => {
    expect(getDynamicGoalSettingKeys("table")).toEqual([]);
    expect(supportsDynamicGoals("table")).toBe(false);
    expect(supportsDynamicGoals(undefined)).toBe(false);
    expect(isDynamicGoalSetting(undefined, "graph.goal_value")).toBe(false);
  });

  it("ignores goal references of settings the display does not resolve", () => {
    const card: GoalCard = {
      display: "progress",
      visualization_settings: {
        "progress.goal": { type: "card", id: 1, column: "sum" },
      },
    };

    expect(getReferencedEntities(card)).toEqual([]);
    expect(hasUnansweredGoalReferences(card, undefined)).toBe(false);
    expect(hasUnresolvedGoalReferences(card, undefined)).toBe(false);
  });

  it("does not resolve graph goal values yet", () => {
    const card: GoalCard = {
      display: "line",
      visualization_settings: {
        "graph.show_goal": true,
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      },
    };

    expect(isDynamicGoalSetting("line", "graph.goal_value")).toBe(false);
    expect(getReferencedEntities(card)).toEqual([]);
  });
});

describe("getGoalValuesFromVizSettings", () => {
  const settings: VisualizationSettings = {
    "graph.goal_value": 7,
    "progress.goal": { type: "card", id: 1, column: "sum" },
    "gauge.segments": [
      { min: 0, max: { type: "measure", id: 2, column: "avg" }, color: "red" },
      { min: null, max: 50, color: "blue" },
    ],
    "scalar.segments": [{ min: 10, max: null, color: "green" }],
  } satisfies VisualizationSettings;

  it("reads single-value settings, skipping absent ones", () => {
    expect(
      getGoalValuesFromVizSettings(settings, [
        "graph.goal_value",
        "progress.goal",
      ]),
    ).toEqual([7, { type: "card", id: 1, column: "sum" }]);
    expect(
      getGoalValuesFromVizSettings({}, ["graph.goal_value", "progress.goal"]),
    ).toEqual([]);
  });

  it("reads the non-empty bounds of segment settings", () => {
    expect(
      getGoalValuesFromVizSettings(settings, [
        "gauge.segments",
        "scalar.segments",
      ]),
    ).toEqual([0, { type: "measure", id: 2, column: "avg" }, 50, 10]);
  });

  it("skips absent and malformed settings", () => {
    // deliberately malformed input
    const malformed = {
      "graph.goal_value": { id: 1 },
      "scalar.segments": 5,
    } as unknown as VisualizationSettings;

    expect(
      getGoalValuesFromVizSettings(malformed, [
        "graph.goal_value",
        "progress.goal",
        "scalar.segments",
      ]),
    ).toEqual([]);
  });
});

describe("goal value references", () => {
  const data = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
    referenced_entities: {
      card: {
        1: {
          status: "completed",
          data: { cols: [createMockColumn({ name: "sum" })], rows: [[10]] },
        },
        2: { status: "failed", error: "boom" },
      },
    },
  });

  it("collects the entities the data has no answer for, once each", () => {
    expect(
      getUnansweredGoalEntitiesForValues(data, [
        100,
        "value",
        { type: "card", id: 1, column: "sum" },
        { type: "card", id: 1, column: "missing" },
        { type: "card", id: 2, column: "sum" },
        { type: "measure", id: 3, column: "avg" },
        { type: "measure", id: 3, column: "max" },
        null,
        undefined,
      ]),
    ).toEqual([
      { type: "card", id: 1 },
      { type: "measure", id: 3 },
    ]);
  });

  it("reports failed references but not unanswered ones", () => {
    expect(hasFailedGoalReferencesForValues(data, [100, "value"])).toBe(false);
    expect(
      hasFailedGoalReferencesForValues(data, [
        { type: "measure", id: 3, column: "avg" },
      ]),
    ).toBe(false);
    expect(
      hasFailedGoalReferencesForValues(data, [
        { type: "card", id: 2, column: "sum" },
      ]),
    ).toBe(true);
    expect(hasFailedGoalReferencesForValues(data, ["missing"])).toBe(true);
  });
});
