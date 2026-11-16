import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { GoalData } from "metabase/viz-core";
import type { ReferencedEntity } from "metabase-types/api";
import {
  createMockColumn,
  createMockReferencedEntitiesResults,
  createMockReferencedEntityResult,
} from "metabase-types/api/mocks";

import { useAnsweredGoalData } from "./use-answered-goal-data";

const DATA: GoalData = {
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
};

const CARD_9: ReferencedEntity = { type: "card", id: 9 };
const CARD_10: ReferencedEntity = { type: "card", id: 10 };

const CARD_9_ANSWER = {
  9: createMockReferencedEntityResult({ column: "goal", value: 250 }),
};

interface SetupOpts {
  data?: GoalData;
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
  it("returns the data as is without fetching when nothing is unanswered", () => {
    const { result } = setup();

    expect(result.current).toEqual({ status: "resolved", data: DATA });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("fetches the values of the unanswered entities and merges them", async () => {
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

    expect(await getLastRequestBody()).toEqual({ sources: [CARD_9] });
  });

  it("keeps answers the data already has when merging in fresh ones", async () => {
    const measureAnswer = {
      4: createMockReferencedEntityResult({ column: "sum", value: 10 }),
    };
    const data: GoalData = {
      ...DATA,
      referenced_entities: { measure: measureAnswer },
    };
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

  it("fails when fetching the values fails", async () => {
    setupGoalValuesEndpoint(() => new Response(null, { status: 500 }));

    const { result } = setup({ entities: [CARD_9] });
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
    expect(getGoalValuesCalls()).toHaveLength(1);
  });

  it("keeps resolving while a retargeted entity's values are in flight", async () => {
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ id: 9, value: 250 }),
      { body: { sources: [CARD_9] }, name: "card-9-values" },
    );
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ id: 10, value: 500 }),
      { body: { sources: [CARD_10] }, name: "card-10-values" },
    );

    const { result, rerender } = setup({ entities: [CARD_9] });

    await waitFor(() => expect(result.current.status).toBe("resolved"));

    rerender({ entities: [CARD_10] });

    // the previous entity's values must not read as an answer for this one
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: {
            card: { 10: { data: { rows: [[500]] } } },
          },
        },
      }),
    );
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

async function getLastRequestBody(): Promise<unknown> {
  const call = fetchMock.callHistory.lastCall("path:/api/dynamic-goal/values");
  return checkNotNull(call?.request).json();
}
