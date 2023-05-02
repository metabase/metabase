import fetchMock from "fetch-mock";
import type { CollectionItem } from "metabase-types/api";

export function setupSearchEndpoints(items: CollectionItem[]) {
  const availableModels = items.map(({ model }) => model);

  fetchMock.get("path:/api/search", uri => {
    const url = new URL(uri);
    const models = url.searchParams.getAll("models");
    const matchedItems = items.filter(({ model }) => models.includes(model));

    return {
      data: matchedItems,
      total: matchedItems.length,
      models, // this should reflect what is in the query param
      available_models: availableModels,
      limit: null,
      offset: null,
      table_db_id: null,
    };
  });
}
