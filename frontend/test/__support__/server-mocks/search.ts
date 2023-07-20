import fetchMock from "fetch-mock";
import type { CollectionItem } from "metabase-types/api";

export function setupSearchEndpoints(items: CollectionItem[]) {
  const availableModels = items.map(({ model }) => model);

  fetchMock.get("path:/api/search", uri => {
    const url = new URL(uri);
    const models = url.searchParams.getAll("models");
    const queryText = url.searchParams.get("q");

    let matchedItems = items;

    if (models && models.length > 0) {
      matchedItems = matchedItems.filter(({ model }) => models.includes(model));
    }

    if (queryText) {
      console.log(matchedItems);
      matchedItems = matchedItems.filter(({ name }) =>
        name.includes(queryText),
      );
      console.log(matchedItems);
    }

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
