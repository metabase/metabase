/**
 * The embed wizard preview renders the Metabase instance in an iframe loaded
 * from the configured Site URL. The page's CSP includes `frame-src 'self'`,
 * which only allows iframes from the same origin as the wizard page. When the
 * Site URL setting points to a different origin than the host the user is on
 * (e.g. site-url=`localhost:3000` but accessed at `metabase.localhost:3000`),
 * the iframe is silently blocked and the preview never loads.
 */
export const isSiteUrlMatchingCurrentOrigin = (
  siteUrl: string | null | undefined,
  currentOrigin: string = window.location.origin,
): boolean => {
  if (!siteUrl) {
    return true;
  }

  try {
    return new URL(siteUrl).origin === currentOrigin;
  } catch {
    return true;
  }
};
