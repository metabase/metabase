import { isWithinIframe } from "metabase/lib/dom";
import { State } from "metabase-types/store";

export const getIsEmbedded = (state: State) => {
  return isWithinIframe();
};

export const getEmbedOptions = (state: State) => {
  return state.embed.options;
};
