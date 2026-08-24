import { color } from "metabase/ui/colors";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  cardHasUnresolvedGoalReferences,
  getGoalSegmentErrors,
  getReferencedEntitiesFromVizSettings,
  getUnansweredGoalEntities,
  hasUnansweredGoalReferences,
  resolveGoalSegments,
  resolveGoalValue,
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

describe("getGoalSegmentErrors", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("reports nothing when every bound resolves", () => {
    expect(
      getGoalSegmentErrors(DATA, [{ min: 0, max: 100, color: "red" }]),
    ).toEqual([]);
  });

  it("reports nothing while a reference is still resolving", () => {
    const errors = getGoalSegmentErrors(DATA, [
      { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
    ]);

    expect(errors).toEqual([]);
  });

  it("reports a bound that will never resolve", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    const errors = getGoalSegmentErrors(data, [
      { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
    ]);

    expect(errors).toEqual([
      {
        type: "card",
        id: 9,
        column: "goal",
        reason: "query-failed",
        message: "boom",
      },
    ]);
  });
});

describe("getReferencedEntitiesFromVizSettings", () => {
  it("returns no referenced entities when there are no settings", () => {
    expect(getReferencedEntitiesFromVizSettings({})).toEqual([]);
  });

  it("returns no referenced entities when there are no foreign references", () => {
    const referencedEntities = getReferencedEntitiesFromVizSettings({
      "gauge.segments": [{ min: 0, max: "goal", color: "red" }],
    });

    expect(referencedEntities).toEqual([]);
  });

  it("collects and dedupes referenced columns per entity", () => {
    const referencedEntities = getReferencedEntitiesFromVizSettings({
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
    });

    expect(referencedEntities).toEqual([
      { type: "card", id: 1, columns: ["sum", "total"] },
      { type: "measure", id: 1, columns: ["avg"] },
    ]);
  });

  it("ignores segments with empty bounds", () => {
    const referencedEntities = getReferencedEntitiesFromVizSettings({
      "gauge.segments": [{ min: null, max: null, color: "red" }],
    });

    expect(referencedEntities).toEqual([]);
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
    expect(getGoalSegmentErrors(data, segments)).toEqual([]);
    expect(getUnansweredGoalEntities(data, segments)).toEqual([]);
    expect(getReferencedEntitiesFromVizSettings(settings)).toEqual([]);
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
  const baseData = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("returns true without any result data", () => {
    expect(hasUnansweredGoalReferences(settings, undefined)).toBe(true);
  });

  it("returns true when the result lacks the referenced entity", () => {
    expect(hasUnansweredGoalReferences(settings, baseData)).toBe(true);
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

    expect(hasUnansweredGoalReferences(settings, data)).toBe(false);
  });

  it("returns false for a failed reference: the result answered it", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    expect(hasUnansweredGoalReferences(settings, data)).toBe(false);
  });

  it("returns false without foreign references", () => {
    const settings: VisualizationSettings = {
      "gauge.segments": [{ min: 0, max: 100, color: "red" }],
    };

    expect(hasUnansweredGoalReferences(settings, undefined)).toBe(false);
  });
});

describe("cardHasUnresolvedGoalReferences", () => {
  const settings: VisualizationSettings = {
    "gauge.segments": [
      { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
    ],
  };
  const gauge = { display: "gauge", visualization_settings: settings } as const;
  const baseData = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("ignores references on a display without dynamic goals", () => {
    const card = {
      display: "table",
      visualization_settings: settings,
    } as const;

    expect(cardHasUnresolvedGoalReferences(card, undefined)).toBe(false);
  });

  it("is true without any result data", () => {
    expect(cardHasUnresolvedGoalReferences(gauge, undefined)).toBe(true);
  });

  it("is true for a failed reference, so it gets retried", () => {
    const data = createMockDatasetData({
      ...baseData,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    expect(cardHasUnresolvedGoalReferences(gauge, data)).toBe(true);
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

    expect(cardHasUnresolvedGoalReferences(gauge, data)).toBe(true);
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

    expect(cardHasUnresolvedGoalReferences(gauge, data)).toBe(false);
  });
});
