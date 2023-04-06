import { State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockAppState,
  createMockDashboardState,
  createMockEmbedState,
  createMockEntitiesState,
  createMockMetabotState,
  createMockParametersState,
  createMockQueryBuilderState,
  createMockSettingsState,
  createMockSetupState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  app: createMockAppState(),
  currentUser: createMockUser(),
  dashboard: createMockDashboardState(),
  embed: createMockEmbedState(),
  entities: createMockEntitiesState(),
  metabot: createMockMetabotState(),
  parameters: createMockParametersState(),
  qb: createMockQueryBuilderState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  ...opts,
});
