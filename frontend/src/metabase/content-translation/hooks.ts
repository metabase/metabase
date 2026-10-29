import { PLUGIN_CONTENT_TRANSLATION } from "./plugins";
import type { ContentTranslationFunction } from "./types";

export const useTranslateContent = <
  T = string | null | undefined,
>(): ContentTranslationFunction => {
  return PLUGIN_CONTENT_TRANSLATION.useTranslateContent<T>();
};
