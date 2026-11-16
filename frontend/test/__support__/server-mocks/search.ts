import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import type { EmbeddingDataPicker } from "metabase/redux/store/embedding-data-picker";
import type { CollectionItem, SearchResult } from "metabase-types/api";

export function setupSearchEndpoints(
  items: (CollectionItem | SearchResult)[],
  delay?: number,
  {
    nativeQueryContents,
  }: {
    nativeQueryContents?: ReadonlyMap<SearchResult["id"], string>;
  } = {},
) {
  const name = "search";
  fetchMock.removeRoute(name);
  fetchMock.get(
    "path:/api/search",
    (call) => {
      const url = new URL(call.url);
      const models = url.searchParams.getAll("models");
      const limit = Number(url.searchParams.get("limit")) || 50;
      const offset = Number(url.searchParams.get("offset"));
      const table_db_id = url.searchParams.get("table_db_id") || null;
      const queryText = url.searchParams.get("q")?.toLowerCase();
      const searchNativeQuery =
        url.searchParams.get("search_native_query") === "true";

      let matchedItems = items.filter(
        ({ id, name }) =>
          !queryText ||
          name.toLowerCase().includes(queryText) ||
          (searchNativeQuery &&
            nativeQueryContents?.get(id)?.toLowerCase().includes(queryText)),
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
    { name, delay },
  );
}

export function setupSearchErrorEndpoint({ status = 400 } = {}) {
  const name = "search";
  fetchMock.removeRoute(name);
  fetchMock.get("path:/api/search", { status }, { name });
}

export function setupEmbeddingDataPickerDecisionEndpoints(
  dataPicker: EmbeddingDataPicker,
) {
  const mockEntityCount = match(dataPicker)
    .with("flat", () => 10)
    .with("staged", () => 100)
    .exhaustive();

  fetchMock.get({
    name: "entity-count",
    url: "path:/api/search",
    query: {
      models: ["dataset", "table", "metric"],
      limit: 0,
    },
    response: {
      total: mockEntityCount,
    },
  });
}
