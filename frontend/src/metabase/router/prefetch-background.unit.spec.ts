import type * as prefetchModule from "./prefetch";

// Its own file, so the module-level registry holds only what these tests put in
// it. `prefetchRegisteredPages` reaches every registration, so a registry shared
// with the other prefetch tests would drag their pages into these assertions.
//
// The registry is module state, so each test takes a fresh copy of the module. A
// test that declines leaves its pages unstarted, and a shared registry would hand
// them to whichever test ran next.
let prefetch: typeof prefetchModule;

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

beforeEach(async () => {
  idleCallbacks = [];
  setConnection(undefined);
  // jsdom has no idle callback. Collect them so a test decides when the tab
  // goes idle, one turn at a time.
  window.requestIdleCallback = (run) => {
    idleCallbacks.push(run);
    return 1;
  };

  jest.resetModules();
  prefetch = await import("./prefetch");
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
    prefetch.registerPagePrefetch("/dashboard", dashboard);
    prefetch.registerPagePrefetch("/collection", collection);

    prefetch.prefetchRegisteredPages();
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
    prefetch.registerPagePrefetch("/first", first);
    prefetch.registerPagePrefetch("/second", second);

    prefetch.prefetchRegisteredPages();

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
    prefetch.registerPagePrefetch("/slow", slow);
    prefetch.registerPagePrefetch("/next", next);

    prefetch.prefetchRegisteredPages();

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
    prefetch.registerPagePrefetch("/late", load);

    let signedIn = false;
    prefetch.prefetchRegisteredPages({ shouldStart: () => signedIn });
    signedIn = true;

    await idleUntilSettled();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing when shouldStart declines", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/declined", load);

    prefetch.prefetchRegisteredPages({ shouldStart: () => false });
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });

  // No link points at a modal, so hovering is never a signal that one is wanted.
  it("fetches a background-only page that a link never would", async () => {
    const modal = jest.fn().mockResolvedValue(undefined);
    prefetch.registerBackgroundPagePrefetch(modal);

    prefetch.prefetchPage("/page/1");
    expect(modal).not.toHaveBeenCalled();

    prefetch.prefetchRegisteredPages();
    await idleUntilSettled();

    expect(modal).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing on a metered connection", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/metered", load);
    setConnection({ saveData: true });

    prefetch.prefetchRegisteredPages();
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });

  it("fetches nothing on a 2g connection", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/slow-2g", load);
    setConnection({ effectiveType: "slow-2g" });

    prefetch.prefetchRegisteredPages();
    await idleUntilSettled();

    expect(load).not.toHaveBeenCalled();
  });
});
