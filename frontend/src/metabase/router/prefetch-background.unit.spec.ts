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
  reject: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = () => res(undefined);
    reject = () => rej(new Error("failed"));
  });
  return { promise, resolve, reject };
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

/**
 * Let everything pending settle, however many turns it takes.
 *
 * A macrotask, so it drains the whole microtask queue. Counting `then` hops
 * instead would tie the tests to how many `await`s the queue happens to use
 * between an idle callback firing and the next one being asked for.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** One turn of the tab being idle. */
async function idleOnce(): Promise<void> {
  await flush();
  const pending = idleCallbacks;
  idleCallbacks = [];
  pending.forEach((run) => run(IDLE_DEADLINE));
  await flush();
}

// Enough turns for every page a test registers, plus the turns the queue spends
// asking whether it is wanted. It is also what stops a test where `shouldStart`
// never says yes: that queue keeps asking on every idle turn, so there is no
// settled state to wait for.
const MAX_IDLE_TURNS = 20;

/** Idle until nothing is waiting on it, or `MAX_IDLE_TURNS` have passed. */
async function idleUntilSettled(): Promise<void> {
  for (let turn = 0; turn < MAX_IDLE_TURNS; turn++) {
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

  // The current user arrives from a request, and someone on the login page signs
  // in without the tab reloading. A no on the first idle turn is not an answer
  // for the rest of the session.
  it("keeps asking shouldStart after it has declined", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/signs-in-later", load);

    let signedIn = false;
    prefetch.prefetchRegisteredPages({ shouldStart: () => signedIn });

    await idleOnce();
    expect(load).not.toHaveBeenCalled();

    signedIn = true;
    await idleOnce();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing while shouldStart declines", async () => {
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

  it("carries on when a page fails to load", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("failed"));
    const next = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/failing", failing);
    prefetch.registerPagePrefetch("/next", next);

    prefetch.prefetchRegisteredPages();
    await idleUntilSettled();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // A failed fetch is forgotten, so the navigation that asks for the page can
  // show the error where the user is looking.
  it("leaves a page that failed in the background open to a later hover", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("failed"));
    prefetch.registerPagePrefetch("/retried", failing);

    prefetch.prefetchRegisteredPages();
    await idleUntilSettled();
    expect(failing).toHaveBeenCalledTimes(1);

    prefetch.prefetchPage("/retried");

    expect(failing).toHaveBeenCalledTimes(2);
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

  // Read again for each page, so a connection that turns metered part way
  // through stops the pass instead of being a decision made at startup.
  it("stops when the connection turns metered part way through", async () => {
    const held = deferred();
    const first = jest.fn().mockReturnValue(held.promise);
    const second = jest.fn().mockResolvedValue(undefined);
    prefetch.registerPagePrefetch("/first", first);
    prefetch.registerPagePrefetch("/second", second);

    prefetch.prefetchRegisteredPages();

    await idleOnce();
    expect(first).toHaveBeenCalledTimes(1);

    setConnection({ saveData: true });
    held.resolve();
    await idleUntilSettled();

    expect(second).not.toHaveBeenCalled();
  });
});
