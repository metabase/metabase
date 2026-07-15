// Pins the QB location-change read seam, the counterpart to url.ts which
// produces the pushes. locationChanged decides between re-running initializeQB
// and dispatching popState based on location.action plus location.state. The
// router migration re-plumbs this read seam, so this locks the current matrix.
import type { Location } from "history";

import * as initializeQBModule from "./core/initializeQB";
import { locationChanged } from "./navigation";

const loc = (over: Partial<Location> = {}): Location =>
  // Unjustified type cast. FIXME
  ({
    pathname: "/question/1",
    search: "",
    hash: "",
    action: "PUSH",
    state: null,
    ...over,
  }) as Location;

const dispatchedAThunk = (dispatch: jest.Mock) =>
  dispatch.mock.calls.some(([action]) => typeof action === "function");

describe("locationChanged", () => {
  let dispatch: jest.Mock;
  let initSpy: jest.SpyInstance;

  beforeEach(() => {
    dispatch = jest.fn();
    initSpy = jest
      .spyOn(initializeQBModule, "initializeQB")
      // Unjustified type cast. FIXME
      .mockReturnValue({ type: "MOCK_INIT" } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does nothing when location and nextLocation are the same reference", () => {
    const location = loc();

    locationChanged(location, location, {})(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("re-initializes QB on an external PUSH to a different pathname", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "PUSH",
      state: null,
    });
    const nextParams = { slug: "2" };

    locationChanged(location, nextLocation, nextParams)(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith(nextLocation, nextParams);
    expect(dispatchedAThunk(dispatch)).toBe(false);
  });

  it("ignores an app-initiated PUSH that carries state", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "PUSH",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("re-initializes QB on an external REPLACE", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "REPLACE",
      state: null,
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(dispatchedAThunk(dispatch)).toBe(false);
  });

  it("ignores an app-initiated REPLACE that carries state", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "REPLACE",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches popState and re-initializes QB on an external POP that changed the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "POP",
      state: null,
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(dispatchedAThunk(dispatch)).toBe(true);
  });

  it("dispatches popState but does not re-initialize QB on an app-initiated POP that changed the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "POP",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatchedAThunk(dispatch)).toBe(true);
  });

  it("does nothing on a POP that did not change the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({ pathname: "/question/1", action: "POP" });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
