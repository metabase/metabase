/**
 * Where a locale's catalogue lives.
 *
 * The build writes a content hash into each file name so the catalogue can be served with
 * far-future cache headers, which means the name cannot be derived from the locale. The document
 * carries a manifest mapping one to the other.
 *
 * Falls back to the plain name, which covers a development tree whose translations have not been
 * built and any older bundle that predates the manifest.
 */
export function localeCatalogUrl(basename: string, locale: string): string {
  const manifest = window.MetabaseLocaleManifest ?? {};
  const filename = manifest[locale.replace(/-/g, "_")] ?? `${locale}.json`;

  return `${basename}/app/locales/${filename}`;
}
