// To keep the components that require content translation tidier, they can
// invoke these facades, which delegate to the plugin implementation
//
import { useCallback } from "react";

import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import type { ContentTranslationFunction } from "./types";

export const useTranslateContent = <
  T = string | null | undefined,
>(): ContentTranslationFunction => {
  return PLUGIN_CONTENT_TRANSLATION.useTranslateContent<T>();
};

/** In EE, translate displayName fields in the object. Otherwise return the
 * object unchanged. */
export const maybeTranslateDisplayNames = <T extends object>(
  obj: T,
  tc: ContentTranslationFunction,
) => {
  return PLUGIN_CONTENT_TRANSLATION.translateDisplayNames(obj, tc);
};

/** Returns a function that can be used to sort user-generated strings in an
 * array by their translations. */
export const useSortByContentTranslation = () => {
  const tc = PLUGIN_CONTENT_TRANSLATION.useTranslateContent();
  // What makes this sort translation-aware is the use of the tc function.
  // 'localeCompare' is just a standard way of comparing two strings
  // alphabetically.
  return useCallback(
    (a: string, b: string) => tc(a).localeCompare(tc(b)),
    [tc],
  );
};
