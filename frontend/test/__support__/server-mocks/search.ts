import fetchMock from "fetch-mock";
import type { SearchModelType, CollectionItem } from "metabase-types/api";

export function setupSearchEndpoints(
  items: CollectionItem[],
  models: SearchModelType[] = [],
) {
  fetchMock.get("path:/api/search", {
    available_models: [
      "dashboard",
      "card",
      "dataset",
      "collection",
      "table",
      "database",
    ],
    data: items,
    total: items.length,
    models, // this should reflect what is in the query param
    limit: null,
    offset: null,
    table_db_id: null,
  });
}
