import { EMBEDDED_DATA_APP_PREFIX } from "embedding-sdk-shared/lib/data-app-embed";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import * as DataAppUrls from "metabase/urls/data-apps";

const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Captures the Metabase install root, runtime prefix, and app name for both iframe routes.
const DATA_APP_IFRAME_PATH_RE = new RegExp(
  `^(.*?)(${escapeRegExp(DataAppUrls.DATA_APP_EMBED_PREFIX)}|${escapeRegExp(EMBEDDED_DATA_APP_PREFIX)})/([^/]+)`,
);

const matchIframePath = () =>
  typeof window === "undefined"
    ? null
    : window.location.pathname.match(DATA_APP_IFRAME_PATH_RE);

/**
 * The iframe URL's data-app prefix, including any Metabase subpath install root.
 * `""` outside the iframe (the dev preview), where the sub-path is the raw pathname.
 *
 *   `/embed/apps/sales/customers/42`     -> `/embed/apps/sales`
 *   `/mb/embed/apps/sales/customers/42`  -> `/mb/embed/apps/sales`
 *   `/customers/42`                      -> `""`
 */
export const getBasename = (): string => {
  const match = matchIframePath();

  return match ? `${match[1]}${match[2]}/${match[3]}` : "";
};

/**
 * The prefix of the app's own page in Metabase, the URL a person can open or
 * share, including any subpath install root. `""` in the dev preview.
 *
 *   `/embed/apps/sales/customers/42`     -> `/apps/sales`
 *   `/mb/embed/apps/sales/customers/42`  -> `/mb/apps/sales`
 *   `/customers/42`                      -> `""`
 */
export const getPageBasename = (): string => {
  const match = matchIframePath();

  return match ? `${match[1]}${DataAppUrls.DATA_APP_ROOT_URL}/${match[3]}` : "";
};

const subscribers = new Set<() => void>();
let detachPopstate: (() => void) | undefined;

const notify = () => subscribers.forEach((subscriber) => subscriber());

/**
 * Notifies on every in-app navigation: `<DataAppLink>` clicks, `navigate()` calls,
 * and browser back/forward. `pushState` fires no event of its own, so `navigate`
 * notifies explicitly; `popstate` covers the rest.
 */
export const subscribeToDataAppRouting = (callback: () => void) => {
  subscribers.add(callback);

  if (!detachPopstate) {
    window.addEventListener("popstate", notify);
    detachPopstate = () => window.removeEventListener("popstate", notify);
  }

  return () => {
    subscribers.delete(callback);

    if (subscribers.size === 0) {
      detachPopstate?.();
      detachPopstate = undefined;
    }
  };
};

/**
 * Switches to a bundle-relative sub-path (`/customers/42`) without a reload.
 * Goes through the native `pushState` on purpose: the host mirrors the iframe
 * URL into the parent's address bar by patching exactly that method.
 */
export const navigate = (to: string) => {
  window.history.pushState(null, "", getBasename() + to);
  notify();
};
