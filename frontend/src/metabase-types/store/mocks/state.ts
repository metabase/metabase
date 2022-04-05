import { createMockUser } from "metabase-types/api/mocks";
import { State } from "metabase-types/store";
import {
  createMockAdminState,
  createMockSettingsState,
  createMockEntitiesState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  currentUser: createMockUser(),
  admin: createMockAdminState(),
  settings: createMockSettingsState(),
  entities: createMockEntitiesState(),
  ...opts,
});
