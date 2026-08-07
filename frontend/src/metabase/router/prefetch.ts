type LoadPage = () => Promise<unknown>;

type Registration = {
  pathPrefix: string;
  load: LoadPage;
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
 * `pathPrefix` matches the start of a link's target, so one registration covers
 * a page and everything below it. Two pages may register the same prefix, which
 * is what a route that renders one page or another depending on the license
 * needs.
 */
export function registerPagePrefetch(pathPrefix: string, load: LoadPage): void {
  registrations.push({ pathPrefix, load, isStarted: false });
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
    if (registration.isStarted || !path.startsWith(registration.pathPrefix)) {
      continue;
    }

    registration.isStarted = true;
    registration.load().catch(() => {
      registration.isStarted = false;
    });
  }
}
