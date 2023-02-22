import { EmbedOptions, EmbedState } from "metabase-types/store";

const createMockEmbedOptions = (opts?: Partial<EmbedOptions>) => ({
  ...opts,
});

export const createMockEmbedState = (
  opts?: Partial<EmbedOptions>,
): EmbedState => ({
  options: createMockEmbedOptions(opts),
});
