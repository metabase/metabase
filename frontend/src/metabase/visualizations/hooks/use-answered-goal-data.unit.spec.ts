import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, ReferencedEntity } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockReferencedEntityResult,
} from "metabase-types/api/mocks";

import { useAnsweredGoalData } from "./use-answered-goal-data";

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const CARD_9: ReferencedEntity = { type: "card", id: 9 };

const CARD_9_ANSWER = {
  9: createMockReferencedEntityResult({ column: "goal", value: 250 }),
};

interface SetupOpts {
  data?: DatasetData;
  entities?: ReferencedEntity[];
}

function setup({ data = DATA, entities = [] }: SetupOpts = {}) {
  return renderHookWithProviders(
    ({ entities }: { entities: ReferencedEntity[] }) => {
      return useAnsweredGoalData(data, entities);
    },
    { initialProps: { entities } },
  );
}

describe("useAnsweredGoalData", () => {
  it("returns the dataset as is without fetching when nothing is unanswered", () => {
    const { result } = setup();

    expect(result.current).toEqual({ status: "resolved", data: DATA });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("fetches the goal values of the unanswered references and merges the answers", async () => {
    setupGoalValuesEndpoint({ card: CARD_9_ANSWER });

    const { result } = setup({ entities: [CARD_9] });
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        data: {
          ...DATA,
          referenced_entities: { card: CARD_9_ANSWER, measure: {} },
        },
      }),
    );

    const call = fetchMock.callHistory.lastCall(
      "path:/api/dynamic-goal/values",
    );
    expect(await call?.request?.json()).toEqual({ sources: [CARD_9] });
  });

  it("keeps answers the dataset already has when merging in fresh ones", async () => {
    const measureAnswer = {
      4: createMockReferencedEntityResult({ column: "sum", value: 10 }),
    };
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: { measure: measureAnswer },
    });
    setupGoalValuesEndpoint({ card: CARD_9_ANSWER });

    const { result } = setup({ data, entities: [CARD_9] });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        data: {
          ...data,
          referenced_entities: { card: CARD_9_ANSWER, measure: measureAnswer },
        },
      }),
    );
  });

  it("fails when the goal values request fails", async () => {
    setupGoalValuesEndpoint(500);

    const { result } = setup({ entities: [CARD_9] });
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("keeps resolving while a retargeted reference's answer is in flight", async () => {
    setupGoalValuesEndpoint({
      card: {
        ...CARD_9_ANSWER,
        10: createMockReferencedEntityResult({ column: "goal", value: 10 }),
      },
    });

    const { result, rerender } = setup({ entities: [CARD_9] });

    await waitFor(() => expect(result.current.status).toBe("resolved"));

    rerender({ entities: [{ type: "card", id: 10 }] });

    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: { card: { 10: { status: "completed" } } },
        },
      }),
    );
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}
