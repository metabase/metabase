import {
  applyUserLocalization,
  registerSiteLocalization,
} from "metabase/utils/i18n";
import { loadLocaleCatalog } from "metabase/utils/localization";

/**
 * Applies the catalogues the document asked for, before the first render.
 *
 * The document loads them as plain script tags, so by the time this runs the
 * chunks are already installed and the imports below resolve without a request.
 * `userLocale` replaces the document's user locale, for a document served without
 * a signed-in user; its catalogue is then loaded.
 */
export async function applyDocumentLocales(
  userLocale: string | null = null,
): Promise<void> {
  const documentLocales = window.MetabaseLocales;
  const user = userLocale ?? documentLocales?.user ?? "en";
  const site = documentLocales?.site ?? "en";

  try {
    const [userCatalog, siteCatalog] = await Promise.all([
      loadLocaleCatalog(user),
      site === user ? null : loadLocaleCatalog(site),
    ]);

    registerSiteLocalization(siteCatalog ?? userCatalog);
    applyUserLocalization(userCatalog);
  } catch (error) {
    // A missing catalogue leaves the app in English, which is the msgid source.
    // Failing to boot over it would be worse than an untranslated page.
    console.error("Failed to load the locale catalogues", error);
  }
}
