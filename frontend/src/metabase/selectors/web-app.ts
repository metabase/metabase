import { createSelector } from "reselect";

import {
  isEmbeddingIframe,
  isEmbeddingSdk,
} from "metabase/embedding-sdk/config";

import { getSetting } from "./settings";

export const getIsWebApp = createSelector(
  [(state) => getSetting(state, "site-url")],
  (siteUrl) => {
    const pathname = window.location.pathname.replace(siteUrl, "");
    return (
      !isEmbeddingIframe() &&
      !isEmbeddingSdk() &&
      !pathname.startsWith("/public/") &&
      !pathname.startsWith("/embed/")
    );
  },
);
