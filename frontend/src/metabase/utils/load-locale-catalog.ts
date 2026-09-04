import type { LocaleDataWithLanguage } from "metabase/utils/i18n";

/**
 * Loads a locale's catalogue from our own bundle.
 *
 * Imported rather than fetched so the catalogues go through the same pipeline as
 * every other asset: rspack hashes each one, emits it as its own chunk under
 * `app/dist`, writes the `.br` and `.gz` siblings, and resolves the URL at
 * runtime. A hashed file there is already cacheable, which a fetch of
 * `app/locales/<locale>.json` never qualified for.
 *
 * The SDK cannot use this. It runs in a customer's page against whichever
 * instance it is pointed at, so its catalogue has to come from that instance
 * rather than from whenever the SDK was built. `locale-catalog` is aliased to
 * the sibling module there, which keeps 36 catalogues out of the SDK bundle as
 * well: a context module bundles the whole directory wherever it resolves.
 */
export function loadLocaleCatalog(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  return import(
    /* webpackChunkName: "locale-[request]" */
    `locales/${locale.replace(/-/g, "_")}.json`
  ).then((module) => module.default);
}
