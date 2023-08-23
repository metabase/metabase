import _ from "underscore";
import type {
  SearchResult,
  SearchResults,
  SearchScore,
} from "metabase-types/api";
import { createMockCollection } from "./collection";

export const createMockSearchResult = (
  options: Partial<SearchResult> = {},
): SearchResult => {
  const collection = createMockCollection(options?.collection ?? undefined);

  return {
    id: 1,
    name: "Mock search result",
    description: "Mock search result description",
    model: "card",
    model_id: null,
    archived: null,
    collection,
    collection_position: null,
    table_id: 1,
    table_name: null,
    bookmark: null,
    database_id: 1,
    pk_ref: null,
    table_schema: null,
    collection_authority_level: null,
    updated_at: "2023-01-01T00:00:00.000Z",
    moderated_status: null,
    model_name: null,
    table_description: null,
    initial_sync_status: null,
    dashboard_count: null,
    context: null,
    scores: [createMockSearchScore()],
    ...options,
  };
};

export const createMockSearchScore = (
  options: Partial<SearchScore> = {},
): SearchScore => ({
  score: 1,
  weight: 1,
  name: "text-total-occurrences",
  ...options,
});

export const createMockSearchResults = ({
  items = [createMockSearchResult()],
  options = {},
}: {
  items?: SearchResult[];
  options?: Partial<SearchResults>;
}): SearchResults => {
  const uniqueModels = _.uniq(items.map(item => item.model));

  return {
    available_models: uniqueModels,
    data: items,
    limit: 10,
    models: uniqueModels,
    offset: 0,
    table_db_id: null,
    total: items.length,
    ...options,
  };
};
