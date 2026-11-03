import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { ReferencedEntity } from "metabase-types/api";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";

import { useReferencedEntitiesQuery } from "./use-referenced-entities-query";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const MEASURE: ReferencedEntity = { type: "measure", id: 4 };
const FIRST_CARD: ReferencedEntity = { type: "card", id: 9 };
const SECOND_CARD: ReferencedEntity = { type: "card", id: 12 };

function setup() {
  setupCardDataset();

  return renderHookWithProviders(
    ({ entities }: { entities: ReferencedEntity[] }) =>
      useReferencedEntitiesQuery(DATASET_QUERY, entities),
    { initialProps: { entities: [SECOND_CARD, MEASURE, FIRST_CARD] } },
  );
}

describe("useReferencedEntitiesQuery", () => {
  it("asks for the referenced entities in a stable order", async () => {
    setup();

    await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
    const body: unknown = await checkNotNull(
      getDatasetCalls()[0].request,
    ).json();
    expect(body).toMatchObject({
      referenced_entities: [FIRST_CARD, SECOND_CARD, MEASURE],
    });
  });

  it("reuses the request for the same entities in another order", async () => {
    const { rerender, result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ entities: [MEASURE, FIRST_CARD, SECOND_CARD] });
    // give a second request, if any, the chance to start
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(result.current.isSuccess).toBe(true);
    expect(getDatasetCalls()).toHaveLength(1);
  });

  it("asks for nothing without referenced entities", () => {
    setupCardDataset();

    renderHookWithProviders(
      () => useReferencedEntitiesQuery(DATASET_QUERY, []),
      {},
    );

    expect(getDatasetCalls()).toHaveLength(0);
  });
});

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}
