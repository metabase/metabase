import type {
  InteractiveEmbeddingOptionsState,
  State,
} from "metabase/redux/store";

type EmptyObject = Record<string, never>;

export const getEmbedOptions = (
  state: State,
): InteractiveEmbeddingOptionsState | EmptyObject => {
  return state.embed.options;
};
