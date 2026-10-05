// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { DATA_APP_EMBED_PREFIX } from "metabase/urls/data-apps";

const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Captures everything from the start of `pathname` up to and including the
// data-app `:name` segment. Tolerates a Metabase subpath install
// (`/mb/embed/apps/sales/…`) by allowing arbitrary characters before the
// `DATA_APP_EMBED_PREFIX` literal.
const DATA_APP_BASENAME_RE = new RegExp(
  `^(.*?${escapeRegExp(DATA_APP_EMBED_PREFIX)}/[^/]+)`,
);

/**
 * The iframe URL's data-app prefix, including any Metabase subpath install root.
 * `""` outside the iframe (the dev preview), where the sub-path is the raw pathname.
 *
 *   `/embed/apps/sales/customers/42`     -> `/embed/apps/sales`
 *   `/mb/embed/apps/sales/customers/42`  -> `/mb/embed/apps/sales`
 *   `/customers/42`                      -> `""`
 */
export const getBasename = (): string =>
  typeof window === "undefined"
    ? ""
    : (window.location.pathname.match(DATA_APP_BASENAME_RE)?.[1] ?? "");

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
