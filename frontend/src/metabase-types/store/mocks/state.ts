import { State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockSettingsState,
  createMockEntitiesState,
  createMockSetupState,
  createMockFormState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  currentUser: createMockUser(),
  admin: createMockAdminState(),
  entities: createMockEntitiesState(),
  form: createMockFormState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  ...opts,
});
