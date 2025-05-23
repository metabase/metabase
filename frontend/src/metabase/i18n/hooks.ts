import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import type { ContentTranslationFunction } from "./types";

// To keep the components that require content translation tidier, they can
// invoke this facade, which delegates to the plugin implementation
export const useTranslateContent = (): ContentTranslationFunction => {
  return PLUGIN_CONTENT_TRANSLATION.useTranslateContent();
};

export type TranslateDisplayNamesFunction = <T extends object>(
  obj: T,
  tc: ContentTranslationFunction,
  fieldsToTranslate?: string[],
) => T;

/** In EE, translate displayName fields in the object. Otherwise return the
 * object unchanged. */
export const maybeTranslateDisplayNames: TranslateDisplayNamesFunction = (
  obj,
  tc,
  fieldsToTranslate,
) => {
  return PLUGIN_CONTENT_TRANSLATION.translateDisplayNames(
    obj,
    tc,
    fieldsToTranslate,
  );
};
