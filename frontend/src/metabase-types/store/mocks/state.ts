import { EntitiesState, State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockAppState,
  createMockDashboardState,
  createMockEmbedState,
  createMockMetabotState,
  createMockParametersState,
  createMockQueryBuilderState,
  createMockSettingsState,
  createMockSetupState,
  createMockUploadState,
} from "metabase-types/store/mocks";

// This is a helper for cases when entities state doesn't matter
// Most likely, createEntitiesState from __support__/store would be a better choice
export const createPlaceholderEntitiesState = (): EntitiesState => ({
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
});

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  app: createMockAppState(),
  currentUser: createMockUser(),
  dashboard: createMockDashboardState(),
  embed: createMockEmbedState(),
  entities: createPlaceholderEntitiesState(),
  metabot: createMockMetabotState(),
  parameters: createMockParametersState(),
  qb: createMockQueryBuilderState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  upload: createMockUploadState(),
  ...opts,
});
