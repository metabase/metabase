import { createSettingsState, SettingsState } from "./settings";

export interface State {
  settings: SettingsState;
}

export const createState = (opts?: Partial<State>): State => ({
  settings: createSettingsState(),
  ...opts,
});
