import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};

export const getHasMetabotLogo = (state: State) => {
  return getSetting(state, "show-metabot");
};
