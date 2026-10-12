type LoadPage = () => Promise<unknown>;

type Registration = {
  /**
   * The link prefix that starts this page's fetch, or `null` for a page that
   * only the background pass reaches.
   */
  path: string | null;
  load: LoadPage;
  isExact: boolean;
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
 */
export function registerPagePrefetch(
  path: string,
  load: LoadPage,
  { exact = false }: { exact?: boolean } = {},
): void {
  registrations.push({ path, load, isExact: exact, isStarted: false });
}

/**
 * Ask for a page that no link points at to be fetched in the background.
 *
 * Hovering is never a signal that such a page is wanted, so it takes no path and
 * `prefetchPage` never reaches it. A modal that a menu on the page opens is the
 * case this exists for. The point of fetching it at all is that a tab which
 * outlives a deploy can still open it.
 */
export function registerBackgroundPagePrefetch(load: LoadPage): void {
  registrations.push({ path: null, load, isExact: false, isStarted: false });
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
    if (registration.isStarted || registration.path === null) {
      continue;
    }

    const matches = registration.isExact
      ? path === registration.path
      : path.startsWith(registration.path);

    if (!matches) {
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

function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    const run = () => resolve();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return;
    }
    window.setTimeout(run, NO_IDLE_CALLBACK_DELAY_MS);
  });
}

/**
 * Wait for the tab to be idle, and for the caller to still want this.
 *
 * The caller's answer changes while the app loads. The current user arrives from
 * a request, and someone on the login page signs in without the tab ever
 * reloading, so a single no at the first idle turn says nothing about the rest of
 * the session. This keeps asking instead. A tab that nobody signs into runs one
 * boolean check per idle turn and fetches nothing.
 */
async function waitUntilWanted(shouldStart?: () => boolean): Promise<void> {
  do {
    await nextIdle();
  } while (shouldStart && !shouldStart());
}

/**
 * One page at a time, and only while the tab has nothing else to do.
 *
 * The browser runs a chunk as it arrives, so the cost of a page is main thread
 * time and not only a request. Waiting for the tab to be idle again between
 * pages is what keeps that off the moment the user starts doing something. One
 * at a time also means a page the user asks for competes with a single
 * background request rather than with all of them.
 */
async function startPendingRegistrationsInTurn(
  shouldStart?: () => boolean,
): Promise<void> {
  for (const registration of registrations) {
    if (registration.isStarted) {
      continue;
    }

    await waitUntilWanted(shouldStart);

    // Read again for each page. A connection that turns metered or drops to 2g
    // part way through is a reason to stop rather than to carry on.
    if (!isConnectionWorthGuessingOn()) {
      return;
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
 * `shouldStart` is asked on every idle turn rather than once, so a caller can
 * answer on what it knows by then and change its answer later. The app uses it to
 * fetch nothing for a visitor sitting on the login page, and to start as soon as
 * that visitor signs in.
 */
export function prefetchRegisteredPages({
  shouldStart,
}: {
  shouldStart?: () => boolean;
} = {}): void {
  if (typeof window === "undefined" || !isConnectionWorthGuessingOn()) {
    return;
  }

  void startPendingRegistrationsInTurn(shouldStart);
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
