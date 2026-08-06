import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  getReferencedEntitiesFromVizSettings,
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
    const goalValue = resolveGoalValue(5, data);

    expect(goalValue).toEqual({ value: 5 });
  });

  it("resolves a self-column reference from the current rows", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue("goal", data);

    expect(goalValue).toEqual({ value: 42 });
  });

  it("returns null for a self-column reference that does not exist", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue("missing", data);

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
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

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
    const goalValue = resolveGoalValue(
      { type: "measure", id: 3, column: "avg" },
      data,
    );

    expect(goalValue).toEqual({
      value: 55,
    });
  });

  it("errors when the referenced query failed", () => {
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
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

    expect(goalValue).toEqual({
      value: null,
      error: {
        type: "card",
        id: 7,
        column: "total",
        reason: "query-failed",
      },
    });
  });

  it("is resolving when the referenced entity is absent from the response", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_entities: {},
    });
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

    expect(goalValue).toEqual({ value: null, isResolving: true });
  });

  it("is resolving while referenced results are unavailable", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

    expect(goalValue).toEqual({ value: null, isResolving: true });
  });

  it("errors when the referenced column is missing", () => {
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
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

    expect(goalValue).toEqual({
      value: null,
      error: {
        type: "card",
        id: 7,
        column: "total",
        reason: "column-not-found",
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
    const goalValue = resolveGoalValue(
      { type: "card", id: 7, column: "total" },
      data,
    );

    expect(goalValue).toEqual({
      value: null,
      error: {
        type: "card",
        id: 7,
        column: "total",
        reason: "not-a-number",
      },
    });
  });
});

describe("getReferencedEntitiesFromVizSettings", () => {
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
});

describe("resolveGoalSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps static numeric segments", () => {
    const { segments, errors } = resolveGoalSegments(
      [{ min: 0, max: 100, color: "red", label: "range" }],
      DATA,
    );

    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { min: 0, max: 100, color: "red", label: "range" },
    ]);
  });

  it("resolves a foreign reference from referenced_entities", () => {
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

    const { segments, errors } = resolveGoalSegments(
      [
        {
          min: 0,
          max: { type: "card", id: 9, column: "goal" },
          color: "green",
        },
      ],
      data,
    );

    expect(errors).toEqual([]);
    expect(segments).toEqual([{ min: 0, max: 250, color: "green" }]);
  });

  it("drops segments that fail to resolve and reports errors", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });
    const { segments, errors } = resolveGoalSegments(
      [
        {
          min: 0,
          max: { type: "card", id: 9, column: "goal" },
          color: "green",
        },
      ],
      data,
    );

    expect(segments).toEqual([]);
    expect(errors).toEqual([
      { type: "card", id: 9, column: "goal", reason: "query-failed" },
    ]);
  });
});
