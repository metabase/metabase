import { State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockAppState,
  createMockEmbedState,
  createMockEntitiesState,
  createMockFormState,
  createMockSettingsState,
  createMockSetupState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  app: createMockAppState(),
  currentUser: createMockUser(),
  embed: createMockEmbedState(),
  entities: createMockEntitiesState(),
  form: createMockFormState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  ...opts,
});
