import type { EntitiesState } from "metabase/redux/store";

// This is a helper for cases when entities state doesn't matter
// Most likely, createMockEntitiesState from __support__/store would be a better choice
export const createMockNormalizedEntitiesState = (): EntitiesState => ({
  collections: {},
  dashboards: {},
  databases: {},
  schemas: {},
  tables: {},
  fields: {},
  segments: {},
  measures: {},
  metrics: {},
  snippets: {},
  questions: {},
});
