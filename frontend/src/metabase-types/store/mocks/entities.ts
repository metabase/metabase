import type { EntitiesState } from "metabase-types/store";

// This is a helper for cases when entities state doesn't matter
// Most likely, createMockEntitiesState from __support__/store would be a better choice
export const createMockNormalizedEntitiesState = (): EntitiesState => ({
  actions: {},
  alerts: {},
  collections: {},
  dashboards: {},
  databases: {},
  schemas: {},
  tables: {},
  fields: {},
  metrics: {},
  segments: {},
  snippets: {},
  users: {},
  questions: {},
  modelIndexes: {},
  indexedEntities: {},
});
