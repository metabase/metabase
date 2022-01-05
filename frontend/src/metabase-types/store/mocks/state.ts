import { State } from "metabase-types/store";
import { createSettingsState } from "metabase-types/store/mocks";

export const createState = (opts?: Partial<State>): State => ({
  settings: createSettingsState(),
  ...opts,
});
