import { createSelector } from "reselect";

import { getIsEmbeddingIframe, getIsEmbeddingSdk } from "./embed";
import { getSetting } from "./settings";

export const getIsWebApp = createSelector(
  [
    (state) => getSetting(state, "site-url"),
    getIsEmbeddingIframe,
    getIsEmbeddingSdk,
  ],
  (siteUrl, isEmbeddingIframe, isEmbeddingSdk) => {
    const pathname = window.location.pathname.replace(siteUrl, "");
    return (
      !isEmbeddingIframe &&
      !isEmbeddingSdk &&
      !pathname.startsWith("/public/") &&
      !pathname.startsWith("/embed/")
    );
  },
);
