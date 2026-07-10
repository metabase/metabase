import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  getReferencedCardsFromVizSettings,
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

  it("resolves a GoalSource from referenced_cards", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_cards: {
        "7": {
          status: "completed",
          data: {
            cols: [createMockColumn({ name: "total" })],
            rows: [[123]],
          },
        },
      },
    });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: 123,
    });
  });

  it("errors when the referenced query failed", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_cards: {
        "7": {
          status: "failed",
          error: "boom",
        },
      },
    });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: null,
      error: {
        card_id: 7,
        column: "total",
        reason: "query-failed",
      },
    });
  });

  it("errors when the referenced card is absent from the response", () => {
    const data = createMockDatasetData({ cols, rows, referenced_cards: {} });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: null,
      error: { card_id: 7, column: "total", reason: "query-failed" },
    });
  });

  it("does not error while referenced results are unavailable", () => {
    const data = createMockDatasetData({ cols, rows });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: null,
    });
  });

  it("errors when the referenced column is missing", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_cards: {
        "7": {
          status: "completed",
          data: { cols: [createMockColumn({ name: "other" })], rows: [[1]] },
        },
      },
    });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: null,
      error: {
        card_id: 7,
        column: "total",
        reason: "column-not-found",
      },
    });
  });

  it("errors when the referenced value is not a number", () => {
    const data = createMockDatasetData({
      cols,
      rows,
      referenced_cards: {
        "7": {
          status: "completed",
          data: {
            cols: [createMockColumn({ name: "total" })],
            rows: [["nope"]],
          },
        },
      },
    });
    const goalValue = resolveGoalValue({ card_id: 7, column: "total" }, data);

    expect(goalValue).toEqual({
      value: null,
      error: {
        card_id: 7,
        column: "total",
        reason: "not-a-number",
      },
    });
  });
});

describe("getReferencedCardsFromVizSettings", () => {
  it("returns no referenced cards when there are no cross-question references", () => {
    const referencedCards = getReferencedCardsFromVizSettings({
      "gauge.segments": [{ min: 0, max: "goal", color: "red" }],
    });

    expect(referencedCards).toEqual([]);
  });

  it("collects and dedupes referenced columns per card", () => {
    const referencedCards = getReferencedCardsFromVizSettings({
      "gauge.segments": [
        {
          min: { card_id: 1, column: "sum" },
          max: 100,
          color: "red",
        },
        {
          min: 100,
          max: { card_id: 1, column: "total" },
          color: "yellow",
        },
        {
          min: { card_id: 2, column: "avg" },
          max: { card_id: 1, column: "sum" },
          color: "green",
        },
      ],
    });

    expect(referencedCards).toEqual([
      { card_id: 1, columns: ["sum", "total"] },
      { card_id: 2, columns: ["avg"] },
    ]);
  });
});
