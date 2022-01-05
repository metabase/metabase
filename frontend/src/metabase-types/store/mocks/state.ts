import { State } from "metabase-types/store";
import { createMockSettingsState } from "metabase-types/store/mocks";

export const createMockState = (opts?: Partial<State>): State => ({
  settings: createMockSettingsState(),
  ...opts,
});
