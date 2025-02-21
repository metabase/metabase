import { act, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";

import { useIsParameterPanelSticky } from "./use-is-parameter-panel-sticky";

type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

const setup = () => {
  const parameterPanelRef = {
    current: document.createElement("div"),
  } as RefObject<HTMLElement>;
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
  let intersectionCallback: IOCallback | null = null;

  const invokeIntersection = async (ratio: number) => {
    await act(() => {
      intersectionCallback?.(
        [{ intersectionRatio: ratio } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  };

  beforeAll(() => {
    originalIntersectionObserver = global.IntersectionObserver;
  });

  beforeEach(() => {
    mockObserve = jest.fn();
    mockDisconnect = jest.fn();

    intersectionCallback = null;

    (global as any).IntersectionObserver = jest.fn(function (
      callback: IOCallback,
    ) {
      intersectionCallback = callback;

      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
      };
    });
  });

  afterAll(() => {
    if (originalIntersectionObserver) {
      global.IntersectionObserver = originalIntersectionObserver;
    } else {
      delete (global as any).IntersectionObserver;
    }
  });

  it("returns initial state", () => {
    const { result } = setup();

    expect(result.current.isSticky).toBe(false);
    expect(result.current.isStickyStateChanging).toBe(false);
  });

  it("sets isSticky to true when intersectionRatio less than 1", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    await invokeIntersection(0.5);

    expect(result.current.isSticky).toBe(true);
  });

  it("sets isSticky to false when intersectionRatio is 1", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    await invokeIntersection(0.7);

    expect(result.current.isSticky).toBe(true);

    await invokeIntersection(1);

    expect(result.current.isSticky).toBe(false);
  });

  it("sets isStickyStateChanging to true and false before and after isSticky is changed", async () => {
    const { result } = setup();
    const originalRaf = global.requestAnimationFrame;

    (global as any).requestAnimationFrame = jest.fn(cb => {
      setTimeout(cb, 0);
    });

    await waitFor(() => {
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    await invokeIntersection(0.7);

    await waitFor(() => {
      expect(result.current.isStickyStateChanging).toBe(true);
    });

    expect(result.current.isSticky).toBe(true);

    await waitFor(() => {
      expect(result.current.isStickyStateChanging).toBe(false);
    });

    (global as any).requestAnimationFrame = originalRaf;
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = setup();
    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
