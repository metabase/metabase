import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export const getEngines = (state: State) => {
  return getSetting(state, "engines");
};

export const getIsHosted = (state: State) => {
  return getSetting(state, "is-hosted?");
};

export const getIsCachingEnabled = (state: State) => {
  return getSetting(state, "enable-query-caching") ?? false;
};
