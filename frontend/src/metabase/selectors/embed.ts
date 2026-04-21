import type {
  InteractiveEmbeddingOptionsState,
  State,
} from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

export const getIsEmbeddingIframe = (_state?: State): boolean => {
  return isWithinIframe();
};

type EmptyObject = Record<string, never>;
export const getEmbedOptions = (
  state: State,
): InteractiveEmbeddingOptionsState | EmptyObject => {
  return state.embed.options;
};
