import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useResolvedGoalData } from "./use-resolved-goal-data";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const GOAL_REF: GoalValue = { type: "card", id: 9, column: "goal" };

function setup(data: DatasetData, goalValues: (GoalValue | null)[]) {
  return renderHookWithProviders(
    () => useResolvedGoalData(DATASET_QUERY, data, goalValues),
    {},
  );
}

function createAnswer(goal: number, column = "goal") {
  return createMockDatasetData({
    referenced_entities: {
      card: {
        9: {
          status: "completed",
          data: { cols: [createMockColumn({ name: column })], rows: [[goal]] },
        },
      },
    },
  });
}

describe("useResolvedGoalData", () => {
  it("resolves static values, self-column names and empty bounds without fetching", () => {
    const { result } = setup(DATA, [0, 100, "count", null]);

    expect(result.current).toEqual({ status: "resolved", data: DATA });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("answers references the dataset can't by re-running the query with them attached", async () => {
    setupCardDataset({ dataset: { data: createAnswer(250) } });

    const { result } = setup(DATA, [0, GOAL_REF]);
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          rows: DATA.rows,
          referenced_entities: { card: { 9: { data: { rows: [[250]] } } } },
        },
      }),
    );

    const call = fetchMock.callHistory.lastCall("path:/api/dataset");
    expect(await call?.request?.json()).toMatchObject({
      referenced_entities: [{ type: "card", id: 9 }],
    });
  });

  it("fails without fetching when the dataset already reports a failed reference", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    const { result } = setup(data, [0, GOAL_REF]);

    expect(result.current).toEqual({ status: "failed" });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fails without fetching when a self-column name matches no column", () => {
    const { result } = setup(DATA, ["missing", 100]);

    expect(result.current).toEqual({ status: "failed" });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fails when the fresh answer still lacks the referenced column", async () => {
    setupCardDataset({ dataset: { data: createAnswer(1, "other") } });

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the resolving query fails", async () => {
    setupCardDataset({ status: 500 });

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the fresh answer reports a failed reference", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: { 9: { status: "failed", error: "boom" } },
          },
        }),
      },
    });

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("keeps resolving while a retargeted reference's answer is in flight", async () => {
    fetchMock.post("path:/api/dataset", async (call) => {
      const body = await fetchMock.callHistory
        .lastCall(call.url)
        ?.request?.json();
      const [entity] = body.referenced_entities;
      return {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              [entity.id]: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "goal" })],
                  rows: [[entity.id === 9 ? 250 : 500]],
                },
              },
            },
          },
        }),
      };
    });

    const { result, rerender } = renderHookWithProviders(
      ({ goalValues }: { goalValues: GoalValue[] }) =>
        useResolvedGoalData(DATASET_QUERY, DATA, goalValues),
      { initialProps: { goalValues: [GOAL_REF] } },
    );

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: { card: { 9: { data: { rows: [[250]] } } } },
        },
      }),
    );

    rerender({ goalValues: [{ type: "card", id: 10, column: "goal" }] });

    // the previous question's answer must not read as a failure for this one
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: { card: { 10: { data: { rows: [[500]] } } } },
        },
      }),
    );
  });

  it("keeps answers the dataset already has when merging in fresh ones", async () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        measure: {
          4: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "sum" })], rows: [[10]] },
          },
        },
      },
    });
    setupCardDataset({ dataset: { data: createAnswer(250) } });

    const { result } = setup(data, [
      { type: "measure", id: 4, column: "sum" },
      GOAL_REF,
    ]);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: {
            measure: { 4: { data: { rows: [[10]] } } },
            card: { 9: { data: { rows: [[250]] } } },
          },
        },
      }),
    );
  });
});
