import * as ML from "cljs/metabase.lib.js";
import type { DictionaryForLocale } from "metabase/i18n/types";

/** Make the translations available in Metabase Lib */
export const setContentTranslations = (translations: DictionaryForLocale) => {
  console.log(
    `content_translation.ts, setting translations to ${translations}`,
  );
  ML.set_content_translations(translations);
};
