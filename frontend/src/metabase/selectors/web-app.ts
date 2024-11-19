import { createSelector } from "reselect";

import { getIsEmbedded, getIsEmbeddingSdk } from "./embed";
import { getSetting } from "./settings";

export const getIsWebApp = createSelector(
  [state => getSetting(state, "site-url"), getIsEmbedded, getIsEmbeddingSdk],
  (siteUrl, isEmbedded, isEmbeddingSdk) => {
    const pathname = window.location.pathname.replace(siteUrl, "");
    return (
      !isEmbedded &&
      !isEmbeddingSdk &&
      !pathname.startsWith("/public/") &&
      !pathname.startsWith("/embed/")
    );
  },
);
