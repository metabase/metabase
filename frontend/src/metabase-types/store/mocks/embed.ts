import { EmbedOptions, EmbedState } from "metabase-types/store";
import { DEFAULT_EMBED_OPTIONS } from "metabase/redux/embed";

const createMockEmbedOptions = (opts?: Partial<EmbedOptions>) => ({
  ...(DEFAULT_EMBED_OPTIONS as EmbedOptions),
  ...opts,
});

export const createMockEmbedState = (
  opts?: Partial<EmbedOptions>,
): EmbedState => ({
  options: createMockEmbedOptions(opts),
});
