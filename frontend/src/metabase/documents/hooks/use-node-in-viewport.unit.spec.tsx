import { act, renderHook } from "@testing-library/react";
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

  function elementWithRect(rect: Partial<DOMRect>): HTMLElement {
    const element = document.createElement("div");
    element.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect;
    return element;
  }

  function setup(
    id?: string,
    options?: { isPrinting?: boolean; element?: HTMLElement },
  ) {
    const view = renderHook(() => useNodeInViewport(id), {
      wrapper: options?.isPrinting ? printingWrapper : undefined,
    });
    // The observer is only created once the ref attaches to an element.
    act(() => {
      view.result.current.ref(
        options?.element ?? document.createElement("div"),
      );
    });
    return view;
  }

  const VISIBLE_CARD = { top: 100, bottom: 400 };
  const BELOW_THE_FOLD_CARD = { top: 1000, bottom: 1300 };

  it("is in viewport when the card overlaps the visible area on open", () => {
    const { result } = setup(undefined, {
      element: elementWithRect(VISIBLE_CARD),
    });

    expect(result.current.isInViewport).toBe(true);
  });

  it("is not in viewport when the card is below the fold on open", () => {
    const { result } = setup(undefined, {
      element: elementWithRect(BELOW_THE_FOLD_CARD),
    });

    expect(result.current.isInViewport).toBe(false);
  });

  it("becomes in viewport once the card scrolls into view", () => {
    const { result } = setup(undefined, {
      element: elementWithRect(BELOW_THE_FOLD_CARD),
    });

    setIntersecting(true);

    expect(result.current.isInViewport).toBe(true);
  });

  it("leaves the viewport once the card scrolls out of view", () => {
    const { result } = setup(undefined, {
      element: elementWithRect(VISIBLE_CARD),
    });

    setIntersecting(false);

    expect(result.current.isInViewport).toBe(false);
  });

  it("is always in viewport while printing, even for a card below the fold", () => {
    const { result } = setup(undefined, {
      isPrinting: true,
      element: elementWithRect(BELOW_THE_FOLD_CARD),
    });

    setIntersecting(false);

    expect(result.current.isInViewport).toBe(true);
  });

  it("pre-loads cards within two viewport heights as they approach", () => {
    setup();

    expect(getObserverOptions()).toEqual(
      expect.objectContaining({
        rootMargin: "200%",
        threshold: 0,
      }),
    );
  });

  describe("shouldLoadData", () => {
    it("loads data for a card that's visible on open", () => {
      const { result } = setup("node-1", {
        element: elementWithRect(VISIBLE_CARD),
      });

      expect(result.current.shouldLoadData).toBe(true);
    });

    it("defers data for a card that's below the fold on open", () => {
      const { result } = setup("node-1", {
        element: elementWithRect(BELOW_THE_FOLD_CARD),
      });

      expect(result.current.shouldLoadData).toBe(false);
    });

    it("loads data once a card scrolls into view", () => {
      const { result } = setup("node-1", {
        element: elementWithRect(BELOW_THE_FOLD_CARD),
      });

      setIntersecting(true);

      expect(result.current.shouldLoadData).toBe(true);
    });

    it("defers data for an off-screen card the queue hasn't prefetched", () => {
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => false }),
      );

      const { result } = setup("node-1", {
        element: elementWithRect(BELOW_THE_FOLD_CARD),
      });

      expect(result.current.shouldLoadData).toBe(false);
    });

    it("loads data for an off-screen card the queue has prefetched", () => {
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => true }),
      );

      const { result } = setup("node-1", {
        element: elementWithRect(BELOW_THE_FOLD_CARD),
      });

      expect(result.current.shouldLoadData).toBe(true);
    });
  });
});
