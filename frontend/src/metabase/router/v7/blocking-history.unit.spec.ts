import { UNSAFE_createMemoryHistory as createMemoryHistory } from "react-router";

import type { Location as HistoryLocation } from "../types";

import {
  hasLeaveHooks,
  registerLeaveHook,
  withBlocking,
} from "./blocking-history";

const setup = (initialEntries: string[] = ["/a"]) =>
  withBlocking(createMemoryHistory({ initialEntries, v5Compat: true }));

const cleanups: Array<() => void> = [];

// Register through here so a failed assertion cannot leak a hook into the next
// test: the module registry is shared across the suite.
const register = (
  hook: (nextLocation?: HistoryLocation) => unknown,
  basePath?: string,
) => {
  const unregister = registerLeaveHook(hook, basePath);
  cleanups.push(unregister);
  return unregister;
};

afterEach(() => {
  cleanups.splice(0).forEach((unregister) => unregister());
});

describe("withBlocking", () => {
  it("blocks a push while a hook returns false, and allows it once unregistered", () => {
    const history = setup();
    const unregister = register(() => false);

    history.push("/b");
    expect(history.location.pathname).toBe("/a");

    unregister();
    history.push("/b");
    expect(history.location.pathname).toBe("/b");
  });

  it("allows a push when the hook does not return false", () => {
    const history = setup();
    register(() => undefined);

    history.push("/b");
    expect(history.location.pathname).toBe("/b");
  });

  it("does not notify listeners when replacing to the current URL", () => {
    const history = setup(["/a?x=1"]);
    const listener = jest.fn();
    history.listen(listener);

    history.replace("/a?x=1");
    expect(listener).not.toHaveBeenCalled();

    history.replace("/b");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("blocks a replace while a hook returns false", () => {
    const history = setup();
    register(() => false);

    history.replace("/b");
    expect(history.location.pathname).toBe("/a");
  });

  it("hands the hook the attempted location with a PUSH action", () => {
    const history = setup();
    const hook = jest.fn(() => false);
    register(hook);

    history.push("/b?x=1");

    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/b",
        search: "?x=1",
        action: "PUSH",
      }),
    );
  });

  it("reverts a blocked POP so the browser back button is cancelled", () => {
    const history = setup();
    // The router subscribes via listen once mounted; the POP interception lives
    // in that subscription, so attach one here to mirror a mounted engine.
    history.listen(() => undefined);
    history.push("/b");
    register(() => false);

    history.go(-1);

    expect(history.location.pathname).toBe("/b");
  });

  it("lets a POP through when no hook blocks it", () => {
    const history = setup();
    history.listen(() => undefined);
    history.push("/b");

    history.go(-1);

    expect(history.location.pathname).toBe("/a");
  });

  it("does not fire a route-scoped hook for a destination within its route", () => {
    const history = setup(["/section/a"]);
    const hook = jest.fn(() => false);
    register(hook, "/section");

    history.push("/section/b");

    expect(hook).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe("/section/b");
  });

  it("fires a route-scoped hook for a destination that leaves its route", () => {
    const history = setup(["/section/a"]);
    const hook = jest.fn(() => false);
    register(hook, "/section");

    history.push("/other");

    expect(hook).toHaveBeenCalled();
    expect(history.location.pathname).toBe("/section/a");
  });

  it("treats the guarded route's own path as within scope", () => {
    const history = setup(["/section/a"]);
    register(() => false, "/section");

    history.push("/section");

    expect(history.location.pathname).toBe("/section");
  });

  it("tracks whether any hook is active", () => {
    expect(hasLeaveHooks()).toBe(false);
    const unregister = register(() => false);
    expect(hasLeaveHooks()).toBe(true);
    unregister();
    expect(hasLeaveHooks()).toBe(false);
  });
});
