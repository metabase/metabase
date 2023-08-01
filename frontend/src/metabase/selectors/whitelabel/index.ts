import { State } from "metabase-types/store";
import { PLUGIN_SELECTORS } from "metabase/plugins";

export function getWhiteLabeledLoadingMessage(state: State) {
  return PLUGIN_SELECTORS.getLoadingMessage(state);
}

export function getIsWhiteLabeling(state: State) {
  return PLUGIN_SELECTORS.getIsWhiteLabeling(state);
}
