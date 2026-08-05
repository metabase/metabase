import { navigate, setRouterExpected, setRouterNavigate } from "./navigator";

// Non-component callers navigate before the router mounts and registers its
// `navigate`. A navigation made in that window (a guard redirecting from a mount
// layout effect) must not be lost, but it also must not leak into a later router
// once this one is gone.
describe("navigate pre-mount buffering", () => {
  beforeEach(() => {
    // `createAppRouter` does this for the app. These tests drive the navigator
    // directly, so they say it themselves.
    setRouterExpected(true);
  });

  afterEach(() => {
    setRouterNavigate(null);
    setRouterExpected(false);
  });

  it("replays the navigations in order, so the history stack is unchanged", () => {
    // Collapsing these to the last one would apply the replace to the entry the
    // user arrived on, and lose `/pushed` from the stack.
    navigate("/pushed");
    navigate("/replaced", { replace: true });

    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    expect(routerNavigate.mock.calls).toEqual([
      ["/pushed", undefined],
      ["/replaced", { replace: true }],
    ]);
  });

  it("buffers a navigation made before the router mounts and flushes it on register", () => {
    navigate("/target", { replace: true });

    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    expect(routerNavigate).toHaveBeenCalledWith("/target", { replace: true });
  });

  it("navigates immediately once the router is registered", () => {
    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    navigate("/now");

    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  it("passes a delta straight through", () => {
    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    navigate(-1);

    expect(routerNavigate).toHaveBeenCalledWith(-1);
  });

  it("drops a buffered navigation when the router unmounts before it flushes", () => {
    navigate("/stale", { replace: true });

    // Router unmounts without ever registering; the next one must not inherit it.
    setRouterNavigate(null);

    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    expect(routerNavigate).not.toHaveBeenCalled();
  });
});

// A host that builds no router never registers a `navigate`, so anything the
// navigator holds for it is held for the life of the page. The SDK is such a
// host and runs for a long time, so it must hold nothing at all.
describe("navigate with no router on the way", () => {
  beforeEach(() => {
    setRouterExpected(false);
  });

  afterEach(() => {
    setRouterNavigate(null);
  });

  it("retains nothing, however many navigations it is given", () => {
    for (let i = 0; i < 100; i++) {
      navigate(`/question/${i}`, { state: { card: "a card" } });
    }

    // Registering is the only way to observe what was held. Nothing should be.
    const routerNavigate = jest.fn();
    setRouterNavigate(routerNavigate);

    expect(routerNavigate).not.toHaveBeenCalled();
  });
});
