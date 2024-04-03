import { PLUGIN_SELECTORS } from "metabase/plugins";
import type { State } from "metabase-types/store";

export function getWhiteLabeledLoadingMessageFactory(state: State) {
  return PLUGIN_SELECTORS.getLoadingMessageFactory(state);
}

export function getIsWhiteLabeling(state: State) {
  return PLUGIN_SELECTORS.getIsWhiteLabeling(state);
}

export function getApplicationName(state: State) {
  return PLUGIN_SELECTORS.getApplicationName(state);
}

export function getCanWhitelabel(state: State) {
  return PLUGIN_SELECTORS.canWhitelabel(state);
}

export function getShowMetabaseLinks(state: State) {
  return PLUGIN_SELECTORS.getShowMetabaseLinks(state);
}
