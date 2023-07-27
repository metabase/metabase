import fetchMock from "fetch-mock";
import type { CollectionItem, SearchResult } from "metabase-types/api";

export function setupSearchEndpoints(items: (CollectionItem | SearchResult)[]) {
  fetchMock.get("path:/api/search", uri => {
    const url = new URL(uri);
    const models = [...new Set(url.searchParams.getAll("models"))];
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const table_db_id = url.searchParams.get("table_db_id") || null;
    const queryText = url.searchParams.get("q");

    let matchedItems = items;
    if (queryText) {
      const searchString = queryText.toLowerCase();

      matchedItems = matchedItems.filter(({ name }) =>
        name.toLowerCase().includes(searchString),
      );
    }

    // available_models: all possible types in a user's database (or in this case, the test data), AFTER the text query filter
    const availableModels = [
      ...new Set(matchedItems.map(({ model }) => model)),
    ];

    if (models && models.length > 0) {
      matchedItems = matchedItems.filter(({ model }) => models.includes(model));
    }

    return {
      data: matchedItems.slice(offset, offset + limit),
      total: matchedItems.length,
      models,
      available_models: availableModels,
      limit,
      offset,
      table_db_id,
    };
  });
}
