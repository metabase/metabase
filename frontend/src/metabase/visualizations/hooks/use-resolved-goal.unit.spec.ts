import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useResolvedGoal } from "./use-resolved-goal";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const CARD_REF: GoalValue = { type: "card", id: 9, column: "goal" };

function answer(cols: string[], row: (number | string)[]) {
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

function setup(data: DatasetData, value: GoalValue | null | undefined) {
  return renderHookWithProviders(
    () => useResolvedGoal(DATASET_QUERY, data, value),
    {},
  );
}

describe("useResolvedGoal", () => {
  it("resolves a static number without fetching", () => {
    const { result } = setup(DATA, 100);

    expect(result.current).toEqual({ status: "resolved", value: 100 });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("resolves an unset goal to null", () => {
    expect(setup(DATA, null).result.current).toEqual({
      status: "resolved",
      value: null,
    });
    expect(setup(DATA, undefined).result.current).toEqual({
      status: "resolved",
      value: null,
    });
  });

  it("resolves a self column from the first row", () => {
    expect(setup(DATA, "count").result.current).toEqual({
      status: "resolved",
      value: 50,
    });
  });

  it("fails for a self column that does not exist", () => {
    expect(setup(DATA, "missing").result.current).toEqual({
      status: "failed",
    });
  });

  it("resolves a foreign reference the dataset already answers", () => {
    const data = {
      ...DATA,
      referenced_entities: answer(["goal"], [250]).referenced_entities,
    };

    expect(setup(data, CARD_REF).result.current).toEqual({
      status: "resolved",
      value: 250,
    });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("answers a foreign reference by re-running the query with it attached", async () => {
    setupCardDataset({ dataset: { data: answer(["goal"], [250]) } });

    const { result } = setup(DATA, CARD_REF);
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toEqual({ status: "resolved", value: 250 }),
    );
    const call = fetchMock.callHistory.lastCall("path:/api/dataset");
    expect(await call?.request?.json()).toMatchObject({
      referenced_entities: [{ type: "card", id: 9 }],
    });
  });

  it("fails when the fresh answer lacks the referenced column", async () => {
    setupCardDataset({ dataset: { data: answer(["other"], [1]) } });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the referenced value is not a number", async () => {
    setupCardDataset({ dataset: { data: answer(["goal"], ["nope"]) } });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails without fetching when the dataset reports a failed reference", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: { card: { 9: { status: "failed", error: "boom" } } },
    });

    expect(setup(data, CARD_REF).result.current).toEqual({ status: "failed" });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fails when the resolving query fails", async () => {
    setupCardDataset({ status: 500 });

    const { result } = setup(DATA, CARD_REF);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });
});
