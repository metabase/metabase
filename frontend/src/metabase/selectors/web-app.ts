import { createSelector } from "reselect";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";

import { getIsEmbeddingIframe } from "./embed";
import { getSetting } from "./settings";

export const getIsWebApp = createSelector(
  [(state) => getSetting(state, "site-url"), getIsEmbeddingIframe],
  (siteUrl, isEmbeddingIframe) => {
    const pathname = window.location.pathname.replace(siteUrl, "");
    return (
      !isEmbeddingIframe &&
      !isEmbeddingSdk() &&
      !pathname.startsWith("/public/") &&
      !pathname.startsWith("/embed/")
    );
  },
);
