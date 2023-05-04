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
// Otherwise, consider using createEntitiesState from __support__/store
const createPlaceholderEntitiesState = (
  opts?: Partial<EntitiesState>,
): EntitiesState => ({
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
  ...opts,
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
