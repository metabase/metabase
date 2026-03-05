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
