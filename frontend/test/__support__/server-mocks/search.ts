import fetchMock from "fetch-mock";
import type { CollectionItem, SearchResult } from "metabase-types/api";

export function setupSearchEndpoints(items: (CollectionItem | SearchResult)[]) {
  const availableModels = items.map(({ model }) => model);

  fetchMock.get("path:/api/search", uri => {
    const url = new URL(uri);
    const models = url.searchParams.getAll("models");
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const table_db_id = url.searchParams.get("table_db_id") || null;
    const queryText = url.searchParams.get("q");

    let matchedItems = items;

    if (models && models.length > 0) {
      matchedItems = matchedItems.filter(({ model }) => models.includes(model));
    }

    if (queryText) {
      matchedItems = matchedItems.filter(({ name }) =>
        name.includes(queryText),
      );
    }

    return {
      data: matchedItems,
      total: matchedItems.length,
      models, // this should reflect what is in the query param
      available_models: availableModels,
      limit,
      offset,
      table_db_id,
    };
  });
}
