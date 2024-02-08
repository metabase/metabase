import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export const getHasDismissedBrowseModelsBanner = (state: State) => {
  return getSetting(state, "dismissed-browse-models-banner");
};
