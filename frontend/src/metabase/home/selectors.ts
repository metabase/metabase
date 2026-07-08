import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};

export const getHasMetabotLogo = (state: State) => {
  return getSetting(state, "show-metabot");
};
