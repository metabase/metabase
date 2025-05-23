import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import type { ContentTranslationFunction } from "./types";

// To keep the components that require content translation tidier, they can
// invoke this facade, which delegates to the plugin implementation
export const useTranslateContent = (): ContentTranslationFunction => {
  return PLUGIN_CONTENT_TRANSLATION.useTranslateContent();
};

/** In EE, translate displayName fields in the object. Otherwise return the
 * object unchanged. */
export const maybeTranslateDisplayNames = <T extends object>(
  obj: T,
  tc: ContentTranslationFunction,
) => {
  return PLUGIN_CONTENT_TRANSLATION.translateDisplayNames(obj, tc);
};
