import _ from "underscore";

import type {
  SearchResponse,
  SearchResult,
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
    display: null,
    model_index_id: null,
    model_id: null,
    archived: null,
    collection,
    collection_position: null,
    can_write: true,
    table_id: 1,
    table_name: null,
    bookmark: null,
    database_id: 1,
    database_name: "test-data",
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
    created_at: "2022-01-01T00:00:00.000Z",
    creator_common_name: "Testy Tableton",
    creator_id: 2,
    last_edited_at: "2023-01-01T00:00:00.000Z",
    last_editor_common_name: "Bobby Tables",
    last_editor_id: 1,
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
  options?: Partial<SearchResponse>;
} = {}): SearchResponse => {
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
