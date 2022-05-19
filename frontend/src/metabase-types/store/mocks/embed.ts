import { EmbedOptions, EmbedState } from "metabase-types/store";

export const createMockEmbedOptions = (opts?: Partial<EmbedOptions>) => ({
  ...opts,
});

export const createMockEmbedState = (
  opts?: Partial<EmbedState>,
): EmbedState => ({
  options: createMockEmbedOptions(),
  ...opts,
});
