import { navigate, setRouterNavigate, toNavigateArgs } from "./navigator";

describe("toNavigateArgs", () => {
  it("maps a descriptor's URL parts onto a v7 target", () => {
    const [to] = toNavigateArgs({
      pathname: "/dashboard/1",
      search: "?filter-date=2024-01-01&tab=2-tab-two",
    });

    expect(to).toEqual({
      pathname: "/dashboard/1",
      search: "?filter-date=2024-01-01&tab=2-tab-two",
      hash: undefined,
    });
  });

  it("passes a string target through untouched", () => {
    expect(toNavigateArgs("/dashboard/1?tab=2")).toEqual([
      "/dashboard/1?tab=2",
      {},
    ]);
  });

  it("carries `state` across as a navigate option", () => {
    const [, options] = toNavigateArgs(
      { pathname: "/a", state: { from: "here" } },
      { replace: true },
    );

    expect(options).toEqual({ replace: true, state: { from: "here" } });
  });
});

// Non-component callers navigate before the router mounts and registers its
// `navigate`. A navigation made in that window (a guard redirecting from a mount
// layout effect) must not be lost, but it also must not leak into a later router
// once this one is gone.
describe("navigate pre-mount buffering", () => {
  afterEach(() => {
    setRouterNavigate(null);
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
