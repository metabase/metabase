import { Scope } from "nock";
import type {
  Card,
  Dashboard,
  Collection,
  Table,
  Database,
} from "metabase-types/api";

type SearchItem = Card | Dashboard | Collection | Table | Database;

export function setupSearchEndpoints(
  scope: Scope,
  items: SearchItem[],
  models: string[] = [],
) {
  scope.get(/\/api\/search+/).reply(200, {
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
