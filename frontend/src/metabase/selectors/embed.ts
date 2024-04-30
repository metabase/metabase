import { isWithinIframe } from "metabase/lib/dom";
import type { EmbedOptions, State } from "metabase-types/store";

export const getIsEmbedded = (_state?: State): boolean => {
  return isWithinIframe();
};

export const getEmbedOptions = (state: State): EmbedOptions => {
  return state.embed.options;
};

export const getIsEmbeddingSdk = (state: State): boolean => {
  return !!state.embed.isEmbeddingSdk;
};
