import { createSelector } from "reselect";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getSetting } from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

export const getIsWebApp = createSelector(
  [(state) => getSetting(state, "site-url"), isWithinIframe],
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
