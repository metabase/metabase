import { State } from "metabase-types/store";

export const getEmbedOptions = (state: State) => {
  return state.embed.options;
};
