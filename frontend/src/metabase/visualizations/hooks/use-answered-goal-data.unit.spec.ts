import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, ReferencedEntity } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useAnsweredGoalData } from "./use-answered-goal-data";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const CARD_9: ReferencedEntity = { type: "card", id: 9 };

const CARD_9_ANSWER = {
  9: {
    status: "completed" as const,
    data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
  },
};

function setup(data: DatasetData, entities: ReferencedEntity[]) {
  return renderHookWithProviders(
    () => useAnsweredGoalData(DATASET_QUERY, data, entities),
    {},
  );
}

describe("useAnsweredGoalData", () => {
  it("returns the dataset as is without fetching when nothing is unanswered", () => {
    const { result } = setup(DATA, []);

    expect(result.current).toEqual({ status: "answered", data: DATA });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("re-runs the query with the unanswered references attached and merges the answers", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: { card: CARD_9_ANSWER },
        }),
      },
    });

    const { result } = setup(DATA, [CARD_9]);
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "answered",
        data: {
          ...DATA,
          referenced_entities: { card: CARD_9_ANSWER, measure: {} },
        },
      }),
    );

    const call = fetchMock.callHistory.lastCall("path:/api/dataset");
    expect(await call?.request?.json()).toMatchObject({
      referenced_entities: [CARD_9],
    });
  });

  it("keeps answers the dataset already has when merging in fresh ones", async () => {
    const measureAnswer = {
      4: {
        status: "completed" as const,
        data: { cols: [createMockColumn({ name: "sum" })], rows: [[10]] },
      },
    };
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: { measure: measureAnswer },
    });
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: { card: CARD_9_ANSWER },
        }),
      },
    });

    const { result } = setup(data, [CARD_9]);

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "answered",
        data: {
          ...data,
          referenced_entities: { card: CARD_9_ANSWER, measure: measureAnswer },
        },
      }),
    );
  });

  it("fails when the resolving query fails", async () => {
    setupCardDataset({ status: 500 });

    const { result } = setup(DATA, [CARD_9]);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the response carries no referenced entities", async () => {
    setupCardDataset({ dataset: { data: createMockDatasetData({}) } });

    const { result } = setup(DATA, [CARD_9]);

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
                  rows: [[entity.id]],
                },
              },
            },
          },
        }),
      };
    });

    const { result, rerender } = renderHookWithProviders(
      ({ entities }: { entities: ReferencedEntity[] }) =>
        useAnsweredGoalData(DATASET_QUERY, DATA, entities),
      { initialProps: { entities: [CARD_9] } },
    );

    await waitFor(() => expect(result.current.status).toBe("answered"));

    rerender({ entities: [{ type: "card", id: 10 }] });

    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "answered",
        data: {
          referenced_entities: { card: { 10: { status: "completed" } } },
        },
      }),
    );
  });
});
