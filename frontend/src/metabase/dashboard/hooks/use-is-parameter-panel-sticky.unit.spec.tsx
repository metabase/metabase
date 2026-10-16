import { act, renderHook, waitFor } from "@testing-library/react";

import { useIsParameterPanelSticky } from "./use-is-parameter-panel-sticky";

const setup = () => {
  const parameterPanelRef: React.RefObject<HTMLDivElement> = {
    current: document.createElement("div"),
  };
  const { result, unmount } = renderHook(() =>
    useIsParameterPanelSticky({ parameterPanelRef }),
  );

  return {
    result,
    unmount,
    parameterPanelRef,
  };
};

describe("useIsParameterPanelSticky", () => {
  let originalIntersectionObserver: typeof IntersectionObserver;
  let mockObserve: jest.Mock;
  let mockDisconnect: jest.Mock;
  let intersectionCallback: IntersectionObserverCallback | null = null;

  const VIEWPORT = new DOMRect(0, 0, 1000, 800);

  type SentinelPosition = "visible" | "above" | "below";

  const SENTINEL_TOP: Record<SentinelPosition, number> = {
    visible: 100,
    above: -100,
    below: VIEWPORT.bottom + 100,
  };

  const createEntry = (
    position: SentinelPosition,
  ): IntersectionObserverEntry => {
    const entry = {
      isIntersecting: position === "visible",
      boundingClientRect: new DOMRect(0, SENTINEL_TOP[position], 1000, 1),
      rootBounds: VIEWPORT,
    };
    // The hook only reads isIntersecting, boundingClientRect and rootBounds
    return entry as IntersectionObserverEntry;
  };

  const invokeIntersections = (positions: SentinelPosition[]) => {
    act(() => {
      intersectionCallback?.(
        positions.map(createEntry),
        // The hook's callback never reads the observer argument
        {} as IntersectionObserver,
      );
    });
  };

  const invokeIntersection = (isIntersecting: boolean) =>
    invokeIntersections([isIntersecting ? "visible" : "above"]);

  beforeAll(() => {
    originalIntersectionObserver = global.IntersectionObserver;
  });

  beforeEach(() => {
    mockObserve = jest.fn();
    mockDisconnect = jest.fn();

    intersectionCallback = null;

    global.IntersectionObserver = class MockedIntersectionObserver implements IntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = mockObserve;
      disconnect = mockDisconnect;
      root: Element | null = null;
      rootMargin: string = "";
      scrollMargin: string = "";
      thresholds: ReadonlyArray<number> = [];
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve() {}
    };
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
  });

  it("returns initial state", () => {
    const { result } = setup();

    expect(result.current.isSticky).toBe(false);
    expect(result.current.isStickyStateChanging).toBe(false);
  });

  it("sets isSticky to true when isIntersecting is false", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    invokeIntersection(false);

    expect(result.current.isSticky).toBe(true);
  });

  it("sets isSticky to false when isIntersecting is true", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    invokeIntersection(true);

    expect(result.current.isSticky).toBe(false);
  });

  it("does not set isSticky when the sentinel is below the viewport", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    invokeIntersections(["below"]);

    expect(result.current.isSticky).toBe(false);
  });

  it("uses the latest entry when several are delivered at once", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    invokeIntersections(["above", "visible"]);
    expect(result.current.isSticky).toBe(false);

    invokeIntersections(["visible", "above"]);
    expect(result.current.isSticky).toBe(true);
  });

  it("sets isStickyStateChanging to true and false before and after isSticky is changed", async () => {
    const { result } = setup();

    const unmockRaf = mockRaf();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    invokeIntersection(false);

    expect(result.current.isStickyStateChanging).toBe(true);

    expect(result.current.isSticky).toBe(true);

    await waitFor(() => {
      expect(result.current.isStickyStateChanging).toBe(false);
    });

    unmockRaf();
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = setup();
    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

// JSDOM uses its own implementation of requestAnimationFrame, which appears to
// be flaky in our tests. This mock is attempt to make results more consistent.
function mockRaf() {
  const originalRaf = global.requestAnimationFrame;

  global.requestAnimationFrame = (callback) => setTimeout(callback, 0);

  return function unmockRaf() {
    global.requestAnimationFrame = originalRaf;
  };
}
