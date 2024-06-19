import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getEmbedOptions } from "metabase/selectors/embed";
import { getSettings } from "metabase/selectors/settings";

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
    // If a font is set in the embed options, we don't need to load any font files.
    // However, we still need to load the custom font files if the font is set to "Custom".
    if (embedOptions.font && embedOptions.font !== "Custom") {
      return [];
    } else {
      return settings["application-font-files"];
    }
  },
);
