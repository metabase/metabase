type LoadPage = () => Promise<unknown>;

type Registration = {
  path: string;
  load: LoadPage;
  isExact: boolean;
  isBackgroundOnly: boolean;
  isStarted: boolean;
};

const registrations: Registration[] = [];

/**
 * Ask for a code-split page to be fetched before the user navigates to it.
 *
 * A page in its own chunk is only requested once its route renders, so the user
 * waits for the network right after they click. A link to it under the pointer
 * is a good signal that the click is coming, and acting on it buys most of that
 * time back.
 *
 * `path` matches the start of a link's target, so one registration covers a page
 * and everything below it. Two pages may register the same prefix, which is what
 * a route that renders one page or another depending on the license needs.
 *
 * `exact` matches the whole path instead. The home page needs it: every path
 * starts with "/", so a prefix registration would fetch it from any link.
 *
 * `backgroundOnly` keeps a page out of the fetch that a link triggers, leaving
 * it to `prefetchRegisteredPages`. Use it where no link points at the page, so
 * hovering is never a signal that it is wanted: a modal that a menu on the page
 * opens, or a section that only some people can reach.
 */
export function registerPagePrefetch(
  path: string,
  load: LoadPage,
  {
    exact = false,
    backgroundOnly = false,
  }: { exact?: boolean; backgroundOnly?: boolean } = {},
): void {
  registrations.push({
    path,
    load,
    isExact: exact,
    isBackgroundOnly: backgroundOnly,
    isStarted: false,
  });
}

/**
 * Start fetching whatever `path` needs, if anything registered for it.
 *
 * Safe to call on every hover: each page is only asked for once, and the bundler
 * hands the same module promise to the render that follows. A failed fetch is
 * forgotten rather than reported, so the navigation asks again and can show the
 * error where the user is looking.
 */
export function prefetchPage(path: string): void {
  for (const registration of registrations) {
    const matches = registration.isExact
      ? path === registration.path
      : path.startsWith(registration.path);

    if (registration.isStarted || registration.isBackgroundOnly || !matches) {
      continue;
    }

    registration.isStarted = true;
    registration.load().catch(() => {
      registration.isStarted = false;
    });
  }
}

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function getConnection(): NetworkInformation | undefined {
  // `navigator.connection` is not in the DOM lib, and this is the only place
  // that reads it.
  return (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
}

/**
 * Whether the connection is one worth spending a guess on.
 *
 * Not a metered or slow one, where guessing wrong is most expensive and the
 * pages being guessed at are the largest chunks the app has.
 */
function isConnectionWorthGuessingOn(): boolean {
  const connection = getConnection();
  return !connection?.saveData && !/2g/.test(connection?.effectiveType ?? "");
}

/**
 * Whether a link coming into view should start its fetch.
 *
 * Only where hovering cannot: a device with a pointer already prefetches on
 * hover, which is a far better signal of intent than a link merely being on
 * screen. This covers the touch devices that never fire one.
 */
function shouldPrefetchOnVisible(): boolean {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return false;
  }

  if (window.matchMedia("(hover: hover)").matches) {
    return false;
  }

  return isConnectionWorthGuessingOn();
}

// Long enough that the callback runs after the app has settled, short enough
// that a tab which is never idle still gets its pages.
const IDLE_TIMEOUT_MS = 10_000;
const NO_IDLE_CALLBACK_DELAY_MS = 3_000;

function whenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  window.setTimeout(run, NO_IDLE_CALLBACK_DELAY_MS);
}

/**
 * One page at a time, so that a page the user asks for while this runs competes
 * with one background request rather than all of them.
 */
async function startPendingRegistrationsInTurn(): Promise<void> {
  for (const registration of registrations) {
    if (registration.isStarted) {
      continue;
    }

    registration.isStarted = true;
    try {
      await registration.load();
    } catch {
      registration.isStarted = false;
    }
  }
}

/**
 * Fetch every registered page once the tab is idle.
 *
 * Each file the app serves is named after its contents, so a deploy replaces all
 * of them. A tab open from before the deploy asks for names nobody serves any
 * more, and the page it asks for cannot be opened. A page fetched before that
 * deploy is held by the bundler for the life of the tab, so it stays available
 * however long the tab stays open.
 *
 * This lowers how often that happens. It does not remove it. A page nobody
 * registered still has to be fetched when the user asks for it, and so does a
 * chunk that a registered page asks for in turn.
 *
 * `shouldStart` is read when the tab goes idle, not when this is called, so a
 * caller can decline on what it knows by then. The app uses it to fetch nothing
 * for a visitor who is sitting on the login page.
 */
export function prefetchRegisteredPages({
  shouldStart,
}: { shouldStart?: () => boolean } = {}): void {
  if (typeof window === "undefined" || !isConnectionWorthGuessingOn()) {
    return;
  }

  whenIdle(() => {
    if (shouldStart && !shouldStart()) {
      return;
    }
    void startPendingRegistrationsInTurn();
  });
}

const observedPaths = new WeakMap<Element, string>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }

      const path = observedPaths.get(entry.target);
      if (path != null) {
        prefetchPage(path);
      }

      // One look is enough: `prefetchPage` starts each page once, so there is
      // nothing to gain from watching this link again.
      getObserver().unobserve(entry.target);
      observedPaths.delete(entry.target);
    }
  });

  return observer;
}

/**
 * Start `path`'s fetch when `element` comes into view.
 *
 * A list of fifty links to the same page costs one fetch, not fifty, because
 * `prefetchPage` starts each registered page once however often it is asked.
 * That is what makes watching every link on screen affordable here.
 *
 * Returns a function that stops watching.
 */
export function observeLinkForPrefetch(
  element: Element,
  path: string,
): () => void {
  if (!shouldPrefetchOnVisible()) {
    return () => undefined;
  }

  observedPaths.set(element, path);
  getObserver().observe(element);

  return () => {
    getObserver().unobserve(element);
    observedPaths.delete(element);
  };
}
