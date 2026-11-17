import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { ReferencedEntity } from "metabase-types/api";

import { useReferencedEntitiesQuery } from "./use-referenced-entities-query";

const MEASURE: ReferencedEntity = { type: "measure", id: 4 };
const FIRST_CARD: ReferencedEntity = { type: "card", id: 9 };
const SECOND_CARD: ReferencedEntity = { type: "card", id: 12 };

function setup() {
  setupGoalValuesEndpoint();

  return renderHookWithProviders(
    ({ entities }: { entities: ReferencedEntity[] }) =>
      useReferencedEntitiesQuery(entities),
    { initialProps: { entities: [SECOND_CARD, MEASURE, FIRST_CARD] } },
  );
}

describe("useReferencedEntitiesQuery", () => {
  it("asks for the goal values of the referenced entities in a stable order", async () => {
    setup();

    await waitFor(() => expect(getGoalValuesCalls()).toHaveLength(1));
    const body: unknown = await checkNotNull(
      getGoalValuesCalls()[0].request,
    ).json();
    expect(body).toEqual({ sources: [FIRST_CARD, SECOND_CARD, MEASURE] });
  });

  it("reuses the request for the same entities in another order", async () => {
    const { rerender, result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ entities: [MEASURE, FIRST_CARD, SECOND_CARD] });
    // give a second request, if any, the chance to start
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(result.current.isSuccess).toBe(true);
    expect(getGoalValuesCalls()).toHaveLength(1);
  });

  it("asks for nothing without referenced entities", () => {
    setupGoalValuesEndpoint();

    renderHookWithProviders(() => useReferencedEntitiesQuery([]), {});

    expect(getGoalValuesCalls()).toHaveLength(0);
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}
