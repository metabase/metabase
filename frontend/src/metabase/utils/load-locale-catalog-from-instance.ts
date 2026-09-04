import { getBasename } from "metabase/utils/basename";
import type { LocaleDataWithLanguage } from "metabase/utils/i18n";

/** What `getSdkBundleVersionFromVersionProperties` returns outside a release build. */
const UNKNOWN_VERSION = "vUNKNOWN";

/**
 * Names the build this bundle came from.
 *
 * The instance serves the SDK bundle, so whatever build produced this file also
 * produced the catalogues it is about to ask for. That makes the bundle's own
 * token a sound cache key for them, with no manifest to read and no ordering
 * between the two rspack configs.
 *
 * `VERSION` is the release tag and is the one that matters in production. It
 * falls back to the sentinel outside a release build, where the commit is both
 * available and more precise. Returning null when neither is known leaves the
 * URL unversioned, which the server declines to cache.
 */
function buildToken(): string | null {
  const version = process.env.VERSION;

  if (version && version !== UNKNOWN_VERSION) {
    return version;
  }

  return process.env.GIT_COMMIT_SHA || null;
}

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
  const token = buildToken();
  const query = token ? `?v=${encodeURIComponent(token)}` : "";

  return fetch(`${getBasename()}/app/locales/${locale}.json${query}`).then(
    (response) => response.json(),
  );
}
