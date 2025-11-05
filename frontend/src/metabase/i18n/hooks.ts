import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import type { ContentTranslationFunction } from "./types";

/** To keep the components that require content translation tidier, they can
 * invoke this facade, which delegates to the plugin implementation */
export const useTranslateContent = <
  T = string | null | undefined,
>(): ContentTranslationFunction => {
  return PLUGIN_CONTENT_TRANSLATION.useTranslateContent<T>();
};
