import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  type LocaleDataWithLanguage,
  applyLocaleDirection,
  setLocalization,
} from "metabase/utils/i18n";

/**
 * Loads a locale's catalogue from our own bundle.
 *
 * Imported rather than fetched so the catalogues go through the same pipeline as
 * every other asset: rspack hashes each one, emits it as its own chunk, writes
 * the `.br` and `.gz` siblings, and resolves the URL at runtime. A hashed chunk
 * is cacheable, which a fetch of `app/locales/<locale>.json` never qualified for.
 */
function loadLocaleCatalog(locale: string): Promise<LocaleDataWithLanguage> {
  return import(
    /* webpackChunkName: "locale-[request]" */
    `locales/${locale.replace(/-/g, "_")}.json`
  ).then((module) => module.default);
}

// note this won't refresh strings that are evaluated at load time
export async function loadLocalization(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  const translationsObject: LocaleDataWithLanguage =
    locale !== "en"
      ? await loadLocaleCatalog(locale)
      : // English is the msgid source, so no catalogue is built for it. This
        // stands in for one and falls back to the literals.
        {
          headers: {
            language: "en",
            "plural-forms": "nplurals=2; plural=(n != 1);",
          },
          translations: {
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Not a user facing string
            "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
          },
        };
  setLocalization(translationsObject);

  // Reflect the writing direction on <html> for the main app only. In embedding-SDK
  // mode the host page must not be mutated (SDK content is scoped by its own wrapper).
  if (!isEmbeddingSdk()) {
    applyLocaleDirection(translationsObject.headers.language);
  }

  return translationsObject;
}
