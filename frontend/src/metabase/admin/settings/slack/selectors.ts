import { createSelector } from "reselect";
import { State } from "metabase-types/store";

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getSlackAppToken = createSelector(
  [getSettings],
  settings => settings["slack-app-token"],
);
