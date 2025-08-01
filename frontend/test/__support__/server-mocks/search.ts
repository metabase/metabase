import fetchMock, { type UserRouteConfig } from "fetch-mock";
import { match } from "ts-pattern";

import type { CollectionItem, SearchResult } from "metabase-types/api";
import type { EmbeddingDataPicker } from "metabase-types/store/embedding-data-picker";

export function setupSearchEndpoints(
  items: (CollectionItem | SearchResult)[],
  options?: UserRouteConfig,
) {
  const name = "search";
  if (options?.overwriteRoutes) {
    try {
      fetchMock.removeRoute(name);
    } catch {
      // Route might not exist, ignore
    }
  }
  fetchMock.get(
    "path:/api/search",
    (callLog) => {
      const url = new URL(callLog.url);
      const models = url.searchParams.getAll("models");
      const limit = Number(url.searchParams.get("limit")) || 50;
      const offset = Number(url.searchParams.get("offset"));
      const table_db_id = url.searchParams.get("table_db_id") || null;
      const queryText = url.searchParams.get("q")?.toLowerCase();

      let matchedItems = items.filter(
        ({ name }) =>
          !queryText || name.toLowerCase().includes(queryText.toLowerCase()),
      );

      const availableModels = [
        ...new Set(matchedItems.map(({ model }) => model)),
      ];

      matchedItems = matchedItems.filter(
        ({ model }) => !models.length || models.includes(model),
      );

      return {
        data: matchedItems.slice(offset, offset + limit),
        total: matchedItems.length,
        models,
        available_models: availableModels,
        limit,
        offset,
        table_db_id,
      };
    },
    { name, ...options },
  );
}

export function setupEmbeddingDataPickerDecisionEndpoints(
  dataPicker: EmbeddingDataPicker,
) {
  const mockEntityCount = match(dataPicker)
    .with("flat", () => 10)
    .with("staged", () => 100)
    .exhaustive();

  fetchMock.get(
    {
      name: "entity-count",
      url: "path:/api/search",
      query: {
        models: ["dataset", "table"],
        limit: 0,
      },
    },
    {
      total: mockEntityCount,
    },
  );
}
