import { createSelector } from "@reduxjs/toolkit";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/lib/dom";
import type {
  InteractiveEmbeddingOptionsState,
  State,
} from "metabase-types/store";

export const getIsEmbeddingIframe = (_state?: State): boolean => {
  return isWithinIframe();
};

type EmptyObject = Record<string, never>;
export const getEmbedOptions = (
  state: State,
): InteractiveEmbeddingOptionsState | EmptyObject => {
  return state.embed.options;
};

/**
 * TODO: Remove this selector and introduce a function in `frontend/src/metabase/embedding/config.ts` instead.
 * Since we won't be getting any value from Redux anymore.
 */
export const getIsEmbedding = createSelector(
  [getIsEmbeddingIframe],
  (isEmbeddingIframe) => isEmbeddingIframe || isEmbeddingSdk(),
);
