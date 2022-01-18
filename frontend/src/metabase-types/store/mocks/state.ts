import { State } from "metabase-types/store";
import {
  createMockAdminState,
  createMockSettingsState,
} from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  settings: createMockSettingsState(),
  ...opts,
});
