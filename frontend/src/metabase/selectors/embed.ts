import { IFRAMED } from "metabase/lib/dom";
import { State } from "metabase-types/store";

export const getIsEmbedded = () => {
  return IFRAMED;
};

export const getEmbedOptions = (state: State) => {
  return state.embed.options;
};
