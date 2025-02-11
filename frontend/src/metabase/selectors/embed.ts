import { isWithinIframe } from "metabase/lib/dom";
import type { InteractiveEmbeddingOptions, State } from "metabase-types/store";

export const getIsEmbedded = (_state?: State): boolean => {
  return isWithinIframe();
};

export const getEmbedOptions = (state: State): InteractiveEmbeddingOptions => {
  return state.embed.options;
};

export const getIsEmbeddingSdk = (state: State): boolean => {
  return !!state.embed.isEmbeddingSdk;
};
