import { Route } from "../route";
import type { Action, Location as HistoryLocation } from "../types";

import { createMemoryAppRouter } from "./create-router";
import { hasLeaveHooks, registerLeaveHook } from "./leave-hooks";

const setup = (initialRoute = "/a") =>
  createMemoryAppRouter(<Route path="*" element={null} />, initialRoute);

const cleanups: Array<() => void> = [];

// Register through here so a failed assertion cannot leak a hook into the next
// test: the module registry is shared across the suite.
const register = (
  hook: (nextLocation?: HistoryLocation, navigationType?: Action) => unknown,
  basePath?: string,
) => {
  const unregister = registerLeaveHook(hook, basePath);
  cleanups.push(unregister);
  return unregister;
};

afterEach(() => {
  cleanups.splice(0).forEach((unregister) => unregister());
});

describe("leave hooks on the data router", () => {
  it("blocks a push while a hook returns false, and allows it once unregistered", async () => {
    const router = setup();
    const unregister = register(() => false);

    await router.navigate("/b");
    expect(router.state.location.pathname).toBe("/a");

    unregister();
    await router.navigate("/b");
    expect(router.state.location.pathname).toBe("/b");
  });

  it("allows a push when the hook does not return false", async () => {
    const router = setup();
    register(() => undefined);

    await router.navigate("/b");
    expect(router.state.location.pathname).toBe("/b");
  });

  it("blocks a replace while a hook returns false", async () => {
    const router = setup();
    register(() => false);

    await router.navigate("/b", { replace: true });
    expect(router.state.location.pathname).toBe("/a");
  });

  it("hands the hook the attempted location and a PUSH navigation type", async () => {
    const router = setup();
    const hook = jest.fn(() => false);
    register(hook);

    await router.navigate("/b?x=1");

    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/b", search: "?x=1" }),
      "PUSH",
    );
  });

  it("reverts a blocked POP so the browser back button is cancelled", async () => {
    const router = setup();
    await router.navigate("/b");
    register(() => false);

    await router.navigate(-1);

    expect(router.state.location.pathname).toBe("/b");
  });

  it("lets a POP through when no hook blocks it", async () => {
    const router = setup();
    await router.navigate("/b");

    await router.navigate(-1);

    expect(router.state.location.pathname).toBe("/a");
  });

  it("does not fire a route-scoped hook for a destination within its route", async () => {
    const router = setup("/section/a");
    const hook = jest.fn(() => false);
    register(hook, "/section");

    await router.navigate("/section/b");

    expect(hook).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/section/b");
  });

  it("fires a route-scoped hook for a destination that leaves its route", async () => {
    const router = setup("/section/a");
    const hook = jest.fn(() => false);
    register(hook, "/section");

    await router.navigate("/other");

    expect(hook).toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/section/a");
  });

  it("treats the guarded route's own path as within scope", async () => {
    const router = setup("/section/a");
    register(() => false, "/section");

    await router.navigate("/section");

    expect(router.state.location.pathname).toBe("/section");
  });

  it("tracks whether any hook is active", () => {
    expect(hasLeaveHooks()).toBe(false);
    const unregister = register(() => false);
    expect(hasLeaveHooks()).toBe(true);
    unregister();
    expect(hasLeaveHooks()).toBe(false);
  });
});
