import type { InteractiveEmbeddingOptions, State } from "metabase-types/store";

type EmptyObject = Record<string, never>;
export const getEmbedOptions = (
  state: State,
): InteractiveEmbeddingOptions | EmptyObject => {
  return state.embed.options;
};
