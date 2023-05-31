import { getSetting } from "metabase/selectors/settings";
import { State } from "metabase-types/store";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};
