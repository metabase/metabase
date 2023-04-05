import { EntitiesState } from "metabase-types/store";

export const createMockEntitiesState = (
  opts?: Partial<EntitiesState>,
): EntitiesState => ({
  actions: {},
  collections: {},
  dashboards: {},
  databases: {},
  schemas: {},
  tables: {},
  fields: {},
  metrics: {},
  snippets: {},
  users: {},
  questions: {},
  ...opts,
});
