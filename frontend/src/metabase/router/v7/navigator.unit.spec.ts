import { createV7Navigator, setV7Navigate, toNavigateArgs } from "./navigator";

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

// The redux navigator is built at store creation, before the router mounts and
// registers its `navigate`. A navigation dispatched in that window (a guard
// redirecting from a mount layout effect) must not be lost, but it also must not
// leak into a later router once this one is gone.
describe("createV7Navigator pre-mount buffering", () => {
  afterEach(() => {
    setV7Navigate(null);
  });

  it("buffers a navigation made before the router mounts and flushes it on register", () => {
    const navigator = createV7Navigator();
    navigator.replace("/target");

    const navigate = jest.fn();
    setV7Navigate(navigate);

    expect(navigate).toHaveBeenCalledWith("/target", { replace: true });
  });

  it("navigates immediately once the router is registered", () => {
    const navigate = jest.fn();
    setV7Navigate(navigate);

    createV7Navigator().push("/now");

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("drops a buffered navigation when the router unmounts before it flushes", () => {
    const navigator = createV7Navigator();
    navigator.replace("/stale");

    // Router unmounts without ever registering; the next one must not inherit it.
    setV7Navigate(null);

    const navigate = jest.fn();
    setV7Navigate(navigate);

    expect(navigate).not.toHaveBeenCalled();
  });
});
