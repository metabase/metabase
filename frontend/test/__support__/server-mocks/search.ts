import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import type { EmbeddingDataPicker } from "metabase/redux/store/embedding-data-picker";
import type { CollectionItem, SearchResult } from "metabase-types/api";

export function setupSearchEndpoints(
  items: (CollectionItem | SearchResult)[],
  delay?: number,
  {
    nativeQueryContents,
    filterByScope = false,
  }: {
    nativeQueryContents?: ReadonlyMap<SearchResult["id"], string>;
    /**
     * Filter on the `collection` and `include_dashboard_questions` params:
     * a scoped search returns the scoped collection and the items in it or in
     * its descendants (read from the result collection's `effective_ancestors`
     * or `location`), and dashboard questions only on request. It does not
     * check permissions.
     */
    filterByScope?: boolean;
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

      if (filterByScope) {
        const collectionId = url.searchParams.get("collection");
        const includeDashboardQuestions =
          url.searchParams.get("include_dashboard_questions") === "true";
        matchedItems = matchedItems.filter(
          (item) =>
            (collectionId == null || isInCollection(item, collectionId)) &&
            (includeDashboardQuestions ||
              !("dashboard" in item) ||
              item.dashboard == null),
        );
      }

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

function isInCollection(
  item: CollectionItem | SearchResult,
  collectionId: string,
) {
  if (item.model === "collection" && String(item.id) === collectionId) {
    return true;
  }
  const collection = item.collection;
  if (!collection) {
    return false;
  }
  const location =
    "location" in collection && typeof collection.location === "string"
      ? collection.location
      : "";
  return (
    String(collection.id) === collectionId ||
    (collection.effective_ancestors ?? []).some(
      (ancestor) => String(ancestor.id) === collectionId,
    ) ||
    location.split("/").includes(collectionId)
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
      models: ["dataset", "table"],
      limit: 0,
    },
    response: {
      total: mockEntityCount,
    },
  });
}
