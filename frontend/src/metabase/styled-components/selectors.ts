import { createSelector } from "@reduxjs/toolkit";

import { getEmbedOptions } from "metabase/embedding/interactive-embedding";
import { getSettings } from "metabase/settings";
import { isEmpty } from "metabase/utils/objects";

export const getFont = createSelector(
  [getSettings, getEmbedOptions],
  (settings, embedOptions) => {
    if (embedOptions.font) {
      return embedOptions.font;
    } else if (!isEmpty(settings["application-font-files"])) {
      return "Custom";
    } else {
      return settings["application-font"];
    }
  },
);

export const getFontFiles = createSelector([getSettings], (settings) => {
  return settings["application-font-files"];
});
