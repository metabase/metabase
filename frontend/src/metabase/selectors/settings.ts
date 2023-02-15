import { createSelector } from "reselect";

import type { Settings, SettingKey } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getSetting = <T extends SettingKey>(
  state: State,
  key: T,
): Settings[T] => getSettings(state)[key];
