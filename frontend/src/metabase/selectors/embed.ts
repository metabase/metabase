import { createSelector } from "@reduxjs/toolkit";

import { isWithinIframe } from "metabase/lib/dom";
import type { InteractiveEmbeddingOptions, State } from "metabase-types/store";

export const getIsEmbeddingIframe = (_state?: State): boolean => {
  return isWithinIframe();
};

type EmptyObject = Record<string, never>;
export const getEmbedOptions = (
  state: State,
): InteractiveEmbeddingOptions | EmptyObject => {
  return state.embed.options;
};

export const getIsEmbeddingSdk = (state: State): boolean => {
  return !!state.embed.isEmbeddingSdk;
};

export const getIsEmbedding = createSelector(
  [getIsEmbeddingIframe, getIsEmbeddingSdk],
  (isEmbeddingIframe, isEmbeddingSdk) => isEmbeddingIframe || isEmbeddingSdk,
);
