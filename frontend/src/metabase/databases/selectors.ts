import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";

export const getEngines = (state: State) => {
  return getSetting(state, "engines");
};

export const getIsHosted = (state: State) => {
  return getSetting(state, "is-hosted?");
};
