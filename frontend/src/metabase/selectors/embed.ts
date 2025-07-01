import { createSelector } from "@reduxjs/toolkit";

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
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

export const getIsEmbedding = createSelector(
  [getIsEmbeddingIframe],
  (isEmbeddingIframe) => isEmbeddingIframe || EMBEDDING_SDK_CONFIG.isSdk,
);
