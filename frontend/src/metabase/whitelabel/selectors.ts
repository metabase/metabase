import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getEmbedOptions } from "metabase/embedding/interactive-embedding";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { getSettings } from "metabase/settings";

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

export function getLoginPageIllustration(state: State) {
  return PLUGIN_SELECTORS.getLoginPageIllustration(state);
}

export function getLandingPageIllustration(state: State) {
  return PLUGIN_SELECTORS.getLandingPageIllustration(state);
}

export function getNoDataIllustration(state: State) {
  return PLUGIN_SELECTORS.getNoDataIllustration(state);
}

export function getNoObjectIllustration(state: State) {
  return PLUGIN_SELECTORS.getNoObjectIllustration(state);
}

export const getFont = createSelector(
  [getSettings, getEmbedOptions],
  (settings, embedOptions) => {
    if (embedOptions.font) {
      return embedOptions.font;
    } else if (!_.isEmpty(settings["application-font-files"])) {
      return "Custom";
    } else {
      return settings["application-font"];
    }
  },
);

export const getFontFiles = createSelector([getSettings], (settings) => {
  return settings["application-font-files"];
});
