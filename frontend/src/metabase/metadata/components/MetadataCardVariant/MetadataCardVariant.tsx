import { createContext, useContext } from "react";

/**
 * `card` (default) is a shadowed card; `outlined` is a flat, bordered box;
 * `plain` has no box, for a section that fills a tab on its own.
 */
export type MetadataCardVariant = "card" | "outlined" | "plain";

const MetadataCardVariantContext = createContext<MetadataCardVariant>("card");

/** Sets how metadata cards (sections and field items) render below it. */
export const MetadataCardVariantProvider = MetadataCardVariantContext.Provider;

export function useMetadataCardVariant(): MetadataCardVariant {
  return useContext(MetadataCardVariantContext);
}
