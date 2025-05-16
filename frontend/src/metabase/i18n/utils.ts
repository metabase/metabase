// To keep the components that require content translation tidier, they can
// invoke these facade functions, which delegate to the plugin implementation

import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import type { ContentTranslationFunction } from "./types";

/** In EE, translate displayName fields in the object. Otherwise return the
 * object unchanged. */
export const maybeTranslateDisplayNames = <T extends object>(
  obj: T,
  tc: ContentTranslationFunction,
) => {
  return PLUGIN_CONTENT_TRANSLATION.translateDisplayNames(obj, tc);
};
