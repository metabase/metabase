import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import { PrintContext } from "metabase/documents/contexts/PrintContext";
import type { PrefetchQueue } from "metabase/documents/utils/prefetch-queue";

import { useNodeInViewport } from "./use-node-in-viewport";

function stubQueue(overrides: Partial<PrefetchQueue> = {}): PrefetchQueue {
  return {
    setEnabled: () => {},
    register: () => () => {},
    reportLoading: () => {},
    notifyViewportChange: () => {},
    hasTicket: () => false,
    hasInflightLoads: () => false,
    subscribe: () => () => {},
    destroy: () => {},
    ...overrides,
  };
}

const mockUsePrefetchQueue = jest.fn();
jest.mock("metabase/documents/contexts/PrefetchQueueContext", () => ({
  usePrefetchQueue: () => mockUsePrefetchQueue(),
}));

const printingWrapper = ({ children }: { children: ReactNode }) => (
  <PrintContext.Provider
    value={{ isPrinting: true, prepareForPrint: async () => {} }}
  >
    {children}
  </PrintContext.Provider>
);

describe("useNodeInViewport", () => {
  const { setIntersecting, getObserverOptions } =
    setupMockIntersectionObserver();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePrefetchQueue.mockReturnValue(null);
  });

  function setup(id?: string, options?: { isPrinting?: boolean }) {
    const view = renderHook(() => useNodeInViewport(id), {
      wrapper: options?.isPrinting ? printingWrapper : undefined,
    });
    // The observer is only created once the ref attaches to an element.
    view.result.current.ref(document.createElement("div"));
    return view;
  }

  it("treats null entry (initial state) as out-of-viewport so queries are deferred", () => {
    const { result } = setup();

    expect(result.current.isInViewport).toBe(false);
  });

  it("returns true when entry is intersecting", () => {
    const { result } = setup();

    setIntersecting(true);

    expect(result.current.isInViewport).toBe(true);
  });

  it("returns false when entry is not intersecting", () => {
    const { result } = setup();

    setIntersecting(false);

    expect(result.current.isInViewport).toBe(false);
  });

  it("returns true when printing regardless of intersection entry", () => {
    const { result } = setup(undefined, { isPrinting: true });

    setIntersecting(false);

    expect(result.current.isInViewport).toBe(true);
  });

  it("observes with a 200% rootMargin", () => {
    setup();

    expect(getObserverOptions()).toEqual(
      expect.objectContaining({
        rootMargin: "200%",
        threshold: 0,
      }),
    );
  });

  describe("shouldLoadData", () => {
    it("matches isInViewport when no prefetch queue is provided", () => {
      const { result } = setup("node-1");

      setIntersecting(true);

      expect(result.current.shouldLoadData).toBe(true);
    });

    it("is false when off-screen and queue has not granted a ticket", () => {
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => false }),
      );

      const { result } = setup("node-1");
      setIntersecting(false);

      expect(result.current.shouldLoadData).toBe(false);
    });

    it("is true when off-screen but queue has granted a prefetch ticket", () => {
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => true }),
      );

      const { result } = setup("node-1");
      setIntersecting(false);

      expect(result.current.shouldLoadData).toBe(true);
    });
  });
});
