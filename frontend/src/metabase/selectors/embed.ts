import { isWithinIframe } from "metabase/lib/dom";
import type { State } from "metabase-types/store";

export const getIsEmbedded = (_state?: State) => {
  return isWithinIframe();
};

export const getEmbedOptions = (state: State) => {
  return state.embed.options;
};
