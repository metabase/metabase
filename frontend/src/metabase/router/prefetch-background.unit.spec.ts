import {
  prefetchPage,
  prefetchRegisteredPages,
  registerPagePrefetch,
} from "./prefetch";

// Its own file, so the module-level registry holds only what these tests put in
// it. `prefetchRegisteredPages` reaches every registration, so a registry shared
// with the other prefetch tests would drag their pages into these assertions.

type Deferred = {
  promise: Promise<unknown>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<unknown>((res) => {
    resolve = () => res(undefined);
  });
  return { promise, resolve };
}

function setConnection(connection: unknown) {
  Object.defineProperty(window.navigator, "connection", {
    value: connection,
    configurable: true,
  });
}

const IDLE_DEADLINE: IdleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
};

let idleCallbacks: IdleRequestCallback[];

beforeEach(() => {
  idleCallbacks = [];
  setConnection(undefined);
  // jsdom has no idle callback. Collect them so a test decides when the tab
  // goes idle, one turn at a time.
  window.requestIdleCallback = (run) => {
    idleCallbacks.push(run);
    return 1;
  };
});

const flush = () => Promise.resolve().then().then().then();

/** One turn of the tab being idle. */
async function idleOnce(): Promise<void> {
  await flush();
  const pending = idleCallbacks;
  idleCallbacks = [];
  pending.forEach((run) => run(IDLE_DEADLINE));
  await flush();
}

/** Idle for as long as there is anything waiting on it. */
async function idleUntilSettled(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await idleOnce();
    if (idleCallbacks.length === 0) {
      return;
    }
  }
}

describe("prefetchRegisteredPages", () => {
  it("fetches every registered page once the tab is idle", async () => {
    const dashboard = jest.fn().mockResolvedValue(undefined);
    const collection = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/dashboard", dashboard);
    registerPagePrefetch("/collection", collection);

    prefetchRegisteredPages();
    expect(dashboard).not.toHaveBeenCalled();

    await idleUntilSettled();

    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledTimes(1);
  });

  // A chunk runs on the main thread as it arrives, so a queue that ran straight
  // through would compete with whatever the user started doing meanwhile.
  it("waits for the tab to be idle again between pages", async () => {
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/first", first);
    registerPagePrefetch("/second", second);

    prefetchRegisteredPages();

    await idleOnce();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    await idleOnce();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // A page the user asks for while this runs should compete with one background
  // request, not with all of them.
  it("fetches one page at a time", async () => {
    const held = deferred();
    const slow = jest.fn().mockReturnValue(held.promise);
    const next = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/slow", slow);
    registerPagePrefetch("/next", next);

    prefetchRegisteredPages();

    await idleOnce();
    expect(slow).toHaveBeenCalledTimes(1);

    // The tab is idle again, but the page in flight has not landed.
    await idleOnce();
    expect(next).not.toHaveBeenCalled();

    held.resolve();
    await idleOnce();
    expect(next).toHaveBeenCalledTimes(1);
  });

  // Read when the tab goes idle, so the app can decline on what it knows by
  // then rather than on what it knew at startup.
  it("asks shouldStart when the tab goes idle, not when called", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/late", load);

    let signedIn = false;
    prefetchRegisteredPages({ shouldStart: () => signedIn });
    signedIn = true;

    await idleUntilSettled();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing when shouldStart declines", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/declined", load);

    prefetchRegisteredPages({ shouldStart: () => false });
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });

  // No link points at a modal, so hovering is never a signal that one is wanted.
  it("fetches a background-only page that a link never would", async () => {
    const modal = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/page/", modal, { backgroundOnly: true });

    prefetchPage("/page/1");
    expect(modal).not.toHaveBeenCalled();

    prefetchRegisteredPages();
    await idleUntilSettled();

    expect(modal).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing on a metered connection", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/metered", load);
    setConnection({ saveData: true });

    prefetchRegisteredPages();
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });

  it("fetches nothing on a 2g connection", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/slow-2g", load);
    setConnection({ effectiveType: "slow-2g" });

    prefetchRegisteredPages();
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });
});
