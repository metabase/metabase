import fetchMock from "fetch-mock";

import type { CollectionItem, SearchResult } from "metabase-types/api";

export function setupSearchEndpoints(items: (CollectionItem | SearchResult)[]) {
  fetchMock.get("path:/api/search", uri => {
    const url = new URL(uri);
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
  });
}
