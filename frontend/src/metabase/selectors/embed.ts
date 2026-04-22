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

/**
 * The metabaseInstanceUrl is only set when running inside the SDK bundle
 * (the SDK store adds an `sdk` slice). Returns undefined otherwise.
 * The type cast is deliberate: the base State type doesn't include the
 * SDK slice because it's registered dynamically by the SDK runtime.
 */
export const getSdkMetabaseInstanceUrl = (state: State): string | undefined => {
  return (state as State & { sdk?: { metabaseInstanceUrl?: string } }).sdk
    ?.metabaseInstanceUrl;
};
