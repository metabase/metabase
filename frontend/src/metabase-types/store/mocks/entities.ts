import type { EntitiesState } from "metabase-types/store";

// This is a helper for cases when entities state doesn't matter
// Most likely, createMockEntitiesState from __support__/store would be a better choice
export const createMockNormalizedEntitiesState = (): EntitiesState => ({
  actions: {},
  collections: {},
  dashboards: {},
  databases: {},
  documents: {},
  schemas: {},
  tables: {},
  fields: {},
  segments: {},
  measures: {},
  snippets: {},
  questions: {},
  indexedEntities: {},
});
