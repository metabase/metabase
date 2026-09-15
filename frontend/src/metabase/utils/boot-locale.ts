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
 */
export async function applyDocumentLocales(): Promise<void> {
  const { user = "en", site = "en" } = window.MetabaseLocales ?? {};

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
