let LOCALE: string | null = null;

export function getLocaleHeader(): string | null {
  return LOCALE;
}

export const setLocaleHeader = (locale: string | null | undefined): void => {
  /* `X-Metabase-Locale` is a header that the BE stores as *user* locale for the scope of the request.
   * We need it to localize downloads. It *currently* only work if there is a user, so it won't work
   * for public/static embedding.
   */
  LOCALE = locale ?? null;
};
