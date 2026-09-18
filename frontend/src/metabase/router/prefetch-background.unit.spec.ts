import {
  prefetchPage,
  prefetchRegisteredPages,
  registerPagePrefetch,
} from "./prefetch";

// Its own file, so the module-level registry holds only what these tests put in
// it. `prefetchRegisteredPages` reaches every registration, so a registry shared
// with the other prefetch tests would drag their pages into these assertions.

type Deferred = { promise: Promise<unknown>; resolve: () => void };

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

let idleCallbacks: IdleRequestCallback[];

beforeEach(() => {
  idleCallbacks = [];
  setConnection(undefined);
  // jsdom has no idle callback. Collect them so a test decides when the tab
  // goes idle.
  window.requestIdleCallback = (run) => {
    idleCallbacks.push(run);
    return 1;
  };
});

const IDLE_DEADLINE: IdleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
};

const goIdle = () => idleCallbacks.forEach((run) => run(IDLE_DEADLINE));

describe("prefetchRegisteredPages", () => {
  it("fetches every registered page once the tab is idle", async () => {
    const dashboard = jest.fn().mockResolvedValue(undefined);
    const collection = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/dashboard", dashboard);
    registerPagePrefetch("/collection", collection);

    prefetchRegisteredPages();
    expect(dashboard).not.toHaveBeenCalled();

    goIdle();
    await Promise.resolve();

    expect(dashboard).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(collection).toHaveBeenCalledTimes(1);
  });

  // A page the user asks for while this runs should compete with one background
  // request, not with all of them.
  it("fetches one page at a time", async () => {
    const first = deferred();
    const load = jest.fn().mockReturnValue(first.promise);
    const next = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/a", load);
    registerPagePrefetch("/b", next);

    prefetchRegisteredPages();
    goIdle();
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    first.resolve();
    await first.promise;
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
  });

  // Read when the tab goes idle, so the app can decline on what it knows by
  // then rather than on what it knew at startup.
  it("asks shouldStart at idle time, not when called", () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/late", load);

    let signedIn = false;
    prefetchRegisteredPages({ shouldStart: () => signedIn });

    goIdle();
    expect(load).not.toHaveBeenCalled();

    signedIn = true;
    goIdle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  // No link points at a modal or at a section the user cannot reach, so hovering
  // is never a signal that either is wanted.
  it("fetches a background-only page that a link never would", () => {
    const modal = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/page/", modal, { backgroundOnly: true });

    prefetchPage("/page/1");
    expect(modal).not.toHaveBeenCalled();

    prefetchRegisteredPages();
    goIdle();
    expect(modal).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing on a metered connection", () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/metered", load);
    setConnection({ saveData: true });

    prefetchRegisteredPages();
    goIdle();

    expect(load).not.toHaveBeenCalled();
  });

  it("fetches nothing on a 2g connection", () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch("/slow", load);
    setConnection({ effectiveType: "slow-2g" });

    prefetchRegisteredPages();
    goIdle();

    expect(load).not.toHaveBeenCalled();
  });
});
