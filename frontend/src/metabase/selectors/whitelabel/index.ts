import { PLUGIN_SELECTORS } from "metabase/plugins";
import type { State } from "metabase-types/store";

export function getWhiteLabeledLoadingMessage(state: State) {
  const message = PLUGIN_SELECTORS.getLoadingMessage(state);

  if (typeof message === "string") {
    return {
      initial: message,
      slow: message,
    };
  }

  return message;
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
