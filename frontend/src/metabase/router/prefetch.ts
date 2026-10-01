type LoadPage = () => Promise<unknown>;

type Registration = {
  path: string;
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

    if (registration.isStarted || !matches) {
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
 * Whether a link coming into view should start its fetch.
 *
 * Only where hovering cannot: a device with a pointer already prefetches on
 * hover, which is a far better signal of intent than a link merely being on
 * screen. This covers the touch devices that never fire one.
 *
 * Not on a metered or slow connection, where guessing wrong is most expensive
 * and the pages being guessed at are the largest chunks the app has.
 */
function shouldPrefetchOnVisible(): boolean {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return false;
  }

  if (window.matchMedia("(hover: hover)").matches) {
    return false;
  }

  const connection = getConnection();
  return !connection?.saveData && !/2g/.test(connection?.effectiveType ?? "");
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
