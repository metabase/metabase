import * as ML from "cljs/metabase.lib.js";
import type { DictionaryForLocale } from "metabase/i18n/types";

export const setContentTranslations = (translations: DictionaryForLocale) => {
  console.log("setting translations in content_translation.ts");
  ML.set_content_translations(translations);
};
