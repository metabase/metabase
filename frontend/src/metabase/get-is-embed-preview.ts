import { IS_EMBED_PREVIEW } from "metabase/lib/embed";

/**
 * The only point of putting this into its own function
 * is so we can mock it up in tests.
 * @internal
 */
export const getIsEmbedPreview = (): boolean => {
  return IS_EMBED_PREVIEW;
};
