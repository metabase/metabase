import { State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockAppState,
  createMockSettingsState,
  createMockEntitiesState,
  createMockSetupState,
  createMockFormState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  app: createMockAppState(),
  currentUser: createMockUser(),
  entities: createMockEntitiesState(),
  form: createMockFormState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  ...opts,
});
