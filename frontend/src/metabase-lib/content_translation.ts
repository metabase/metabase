import * as ML from "cljs/metabase.lib.js";

/** Make the translations available in Metabase Lib */
export const setContentTranslations = (
  translations: Record<string, string>,
) => {
  console.log(
    `content_translation.ts, setting translations to ${JSON.stringify(translations)}`,
  );
  ML.set_content_translations(translations);
};

/** Make the locale available in Metabase Lib */
export const setLocale = (newLocale: string) => {
  console.log("@mbwr72ko", "newLocale", newLocale);
  ML.set_locale(newLocale);
};
