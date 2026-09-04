import { getBasename } from "metabase/utils/basename";
import type { LocaleDataWithLanguage } from "metabase/utils/i18n";

/**
 * Loads a locale's catalogue from the Metabase instance, for the SDK.
 *
 * The SDK renders in a customer's page against whichever instance it is pointed
 * at, so the catalogue has to come from there rather than from its own bundle:
 * the two versions need not match, and bundling them would add every locale to
 * the SDK package.
 *
 * Plain `fetch` rather than the API helpers, which add custom headers and so
 * make the browser send a preflight. The backend does not support preflight on
 * static assets, and skipping it is faster even where it would.
 */
export function loadLocaleCatalog(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  return fetch(`${getBasename()}/app/locales/${locale}.json`).then((response) =>
    response.json(),
  );
}
