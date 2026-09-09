import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useAnsweredGoalValue } from "./use-answered-goal-value";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const CARD_REF: GoalValue = { type: "card", id: 9, column: "goal" };

const RESOLVING = { value: null, isUnanswered: true };

function setup(data: DatasetData, value: GoalValue | null | undefined) {
  return renderHookWithProviders(
    () => useAnsweredGoalValue({ data, datasetQuery: DATASET_QUERY, value }),
    {},
  );
}

describe("useAnsweredGoalValue", () => {
  it("resolves a static number without fetching", () => {
    const { result } = setup(DATA, 100);

    expect(result.current).toEqual({ value: 100 });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("resolves an unset goal to null", () => {
    expect(setup(DATA, null).result.current).toEqual({ value: null });
    expect(setup(DATA, undefined).result.current).toEqual({ value: null });
  });

  it("resolves a self column from the first row", () => {
    expect(setup(DATA, "count").result.current).toEqual({ value: 50 });
  });

  it("fails for a self column that does not exist", () => {
    expect(setup(DATA, "missing").result.current).toEqual({
      value: null,
      error: { column: "missing", reason: "column-not-found" },
    });
  });

  it("resolves a foreign reference the dataset already answers", () => {
    const data = {
      ...DATA,
      referenced_entities: createReferencedEntitiesAnswer(["goal"], [250])
        .referenced_entities,
    };

    expect(setup(data, CARD_REF).result.current).toEqual({ value: 250 });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("answers a foreign reference by re-running the query with it attached", async () => {
    setupCardDataset({
      dataset: { data: createReferencedEntitiesAnswer(["goal"], [250]) },
    });

    const { result } = setup(DATA, CARD_REF);
    expect(result.current).toEqual(RESOLVING);

    await waitFor(() => expect(result.current).toEqual({ value: 250 }));
    const call = fetchMock.callHistory.lastCall("path:/api/dataset");
    expect(await call?.request?.json()).toMatchObject({
      referenced_entities: [{ type: "card", id: 9 }],
    });
  });

  it("fails when the fresh answer lacks the referenced column", async () => {
    setupCardDataset({
      dataset: { data: createReferencedEntitiesAnswer(["other"], [1]) },
    });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        value: null,
        error: { ...CARD_REF, reason: "column-not-found" },
      }),
    );
  });

  it("fails when the referenced value is not a number", async () => {
    setupCardDataset({
      dataset: { data: createReferencedEntitiesAnswer(["goal"], ["nope"]) },
    });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        value: null,
        error: { ...CARD_REF, reason: "not-a-number" },
      }),
    );
  });

  it("fails without fetching when the dataset reports a failed reference", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: { card: { 9: { status: "failed", error: "boom" } } },
    });

    expect(setup(data, CARD_REF).result.current).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed", message: "boom" },
    });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fails when the resolving query fails", async () => {
    setupCardDataset({ status: 500 });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() =>
      expect(result.current).toEqual({
        value: null,
        error: {
          ...CARD_REF,
          reason: "query-failed",
          message: "Couldn't load this value",
        },
      }),
    );
  });
});

function createReferencedEntitiesAnswer(
  cols: string[],
  row: (number | string)[],
) {
  return createMockDatasetData({
    referenced_entities: {
      card: {
        9: {
          status: "completed",
          data: {
            cols: cols.map((name) => createMockColumn({ name })),
            rows: [row],
          },
        },
      },
    },
  });
}
