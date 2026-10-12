import { act, renderHookWithProviders } from "__support__/ui";
import { datasetApi } from "metabase/api/dataset";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { useDraftCardOperations } from "./use-draft-card-operations";

const card = createMockCard({ id: 1, database_id: 1 });
const dataset = createMockDataset();

function draftQueryArgs() {
  return {
    ...card.dataset_query,
    database: card.database_id ?? null,
    parameters: [],
  };
}

describe("useDraftCardOperations", () => {
  it("seeds the adhoc dataset cache synchronously when forking a draft for viz settings (metabase#81349)", () => {
    const { result, store } = renderHookWithProviders(
      () =>
        useDraftCardOperations(undefined, card, card.id, null, null, dataset),
      {},
    );

    act(() => {
      result.current.ensureDraftCard(
        { visualization_settings: { "graph.show_values": true } },
        true,
      );

      // Assert before act() drains microtasks — upsertQueryData would
      // still be pending here, which remounts QuestionChartSettings.
      const cached = datasetApi.endpoints.getAdhocQuery.select(
        draftQueryArgs(),
      )(store.getState());
      expect(cached.status).toBe("fulfilled");
      expect(cached.data).toEqual(dataset);
    });
  });
});
