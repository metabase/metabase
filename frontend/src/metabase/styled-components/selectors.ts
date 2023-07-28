import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";
import { getSettings } from "metabase/selectors/settings";
import { getEmbedOptions } from "metabase/selectors/embed";

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

export const getFontFiles = createSelector(
  [getSettings, getEmbedOptions],
  (settings, embedOptions) => {
    if (embedOptions.font) {
      return [];
    } else {
      return settings["application-font-files"];
    }
  },
);
