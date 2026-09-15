import {
  type LocaleDataWithLanguage,
  setLocalization,
} from "metabase/utils/i18n";

// English is the msgid source, so the translation step builds no catalogue for
// it. This stands in for one and falls back to the literals.
const ENGLISH_CATALOG: LocaleDataWithLanguage = {
  headers: {
    language: "en",
    "plural-forms": "nplurals=2; plural=(n != 1);",
  },
  translations: {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Not a user facing string
    "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
  },
};

/**
 * Loads a locale's catalogue from our own bundle.
 *
 * Imported rather than fetched so the catalogues go through the same pipeline as
 * every other asset: rspack hashes each one, emits it as its own chunk, writes
 * the `.br` and `.gz` siblings, and resolves the URL at runtime. A hashed chunk
 * is cacheable, which a fetch of `app/locales/<locale>.json` never qualified for.
 */
export function loadLocaleCatalog(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  if (locale === "en") {
    return Promise.resolve(ENGLISH_CATALOG);
  }

  return import(
    /* webpackChunkName: "locale-[request]" */
    `locales/${locale.replace(/-/g, "_")}.json`
  ).then((module) => module.default);
}

// note this won't refresh strings that are evaluated at load time
export async function loadLocalization(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  // English resolves without awaiting, which callers that render straight after
  // this rely on.
  const translationsObject: LocaleDataWithLanguage =
    locale === "en" ? ENGLISH_CATALOG : await loadLocaleCatalog(locale);
  setLocalization(translationsObject);

  return translationsObject;
}
