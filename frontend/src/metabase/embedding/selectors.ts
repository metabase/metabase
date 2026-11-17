import { createSelector } from "@reduxjs/toolkit";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { getPathnameWithoutSubPath } from "metabase/utils/dom";
import { selectIsWithinIframe } from "metabase/utils/iframe";

export const getIsWebApp = createSelector(
  [(state: State) => getSetting(state, "site-url"), selectIsWithinIframe],
  (siteUrl, isEmbeddingIframe) => {
    const pathname = getPathnameWithoutSubPath(
      window.location.pathname,
      siteUrl,
    );
    return (
      !isEmbeddingIframe &&
      !isEmbeddingSdk() &&
      !pathname.startsWith("/public/") &&
      !pathname.startsWith("/embed/")
    );
  },
);
