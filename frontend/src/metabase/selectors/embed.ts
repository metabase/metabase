import { isIframe } from "metabase/lib/dom";
import { State } from "metabase-types/store";

export const getIsEmbedded = () => {
  return isIframe();
};

export const getEmbedOptions = (state: State) => {
  return state.embed.options;
};
