import { createSelector } from "reselect";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { selectIsWithinIframe } from "metabase/utils/iframe";

export const getIsWebApp = createSelector(
  [(state: State) => getSetting(state, "site-url"), selectIsWithinIframe],
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
