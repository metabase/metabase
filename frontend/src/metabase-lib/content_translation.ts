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
