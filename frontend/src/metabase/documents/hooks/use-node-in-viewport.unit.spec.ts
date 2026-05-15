import { renderHook } from "@testing-library/react";

import type { PrefetchQueue } from "metabase/documents/utils/prefetch-queue";

import { useNodeInViewport } from "./use-node-in-viewport";

function stubQueue(overrides: Partial<PrefetchQueue> = {}): PrefetchQueue {
  return {
    setEnabled: () => {},
    register: () => () => {},
    reportLoading: () => {},
    notifyViewportChange: () => {},
    forceVisible: () => {},
    notifyIntersectionState: () => {},
    hasTicket: () => false,
    isForceVisible: () => false,
    subscribe: () => () => {},
    destroy: () => {},
    ...overrides,
  };
}

const mockUseIntersection = jest.fn();
const mockUsePrintContext = jest.fn();
const mockUsePrefetchQueue = jest.fn();

jest.mock("@mantine/hooks", () => ({
  useIntersection: (...args: unknown[]) => mockUseIntersection(...args),
}));

jest.mock("metabase/documents/contexts/ScrollContainerContext", () => ({
  useScrollContainer: () => null,
}));

jest.mock("metabase/documents/contexts/PrintContext", () => ({
  usePrintContext: () => mockUsePrintContext(),
}));

jest.mock("metabase/documents/contexts/PrefetchQueueContext", () => ({
  usePrefetchQueue: () => mockUsePrefetchQueue(),
}));

describe("useNodeInViewport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePrintContext.mockReturnValue({
      isPrinting: false,
      prepareForPrint: async () => {},
    });
    mockUsePrefetchQueue.mockReturnValue(null);
  });

  it("treats null entry (initial state) as out-of-viewport so queries are deferred", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: null,
    });

    const { result } = renderHook(() => useNodeInViewport());

    expect(result.current.isInViewport).toBe(false);
  });

  it("returns true when entry is intersecting", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: { isIntersecting: true },
    });

    const { result } = renderHook(() => useNodeInViewport());

    expect(result.current.isInViewport).toBe(true);
  });

  it("returns false when entry is not intersecting", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: { isIntersecting: false },
    });

    const { result } = renderHook(() => useNodeInViewport());

    expect(result.current.isInViewport).toBe(false);
  });

  it("returns true when printing regardless of intersection entry", () => {
    mockUsePrintContext.mockReturnValue({
      isPrinting: true,
      prepareForPrint: async () => {},
    });
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: { isIntersecting: false },
    });

    const { result } = renderHook(() => useNodeInViewport());

    expect(result.current.isInViewport).toBe(true);
  });

  it("passes rootMargin 200% to useIntersection", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: null,
    });

    renderHook(() => useNodeInViewport());

    expect(mockUseIntersection).toHaveBeenCalledWith(
      expect.objectContaining({
        rootMargin: "200%",
        threshold: 0,
      }),
    );
  });

  describe("shouldLoadData", () => {
    it("matches isInViewport when no prefetch queue is provided", () => {
      mockUseIntersection.mockReturnValue({
        ref: jest.fn(),
        entry: { isIntersecting: true },
      });

      const { result } = renderHook(() => useNodeInViewport("node-1"));

      expect(result.current.shouldLoadData).toBe(true);
    });

    it("is false when off-screen and queue has not granted a ticket", () => {
      mockUseIntersection.mockReturnValue({
        ref: jest.fn(),
        entry: { isIntersecting: false },
      });
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => false }),
      );

      const { result } = renderHook(() => useNodeInViewport("node-1"));

      expect(result.current.shouldLoadData).toBe(false);
    });

    it("is true when off-screen but queue has granted a prefetch ticket", () => {
      mockUseIntersection.mockReturnValue({
        ref: jest.fn(),
        entry: { isIntersecting: false },
      });
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ hasTicket: () => true }),
      );

      const { result } = renderHook(() => useNodeInViewport("node-1"));

      expect(result.current.shouldLoadData).toBe(true);
    });
  });

  describe("forceVisible override", () => {
    it("treats card as in viewport when queue reports it force-visible", () => {
      mockUseIntersection.mockReturnValue({
        ref: jest.fn(),
        entry: { isIntersecting: false },
      });
      mockUsePrefetchQueue.mockReturnValue(
        stubQueue({ isForceVisible: () => true }),
      );

      const { result } = renderHook(() => useNodeInViewport("node-1"));

      expect(result.current.isInViewport).toBe(true);
      expect(result.current.shouldLoadData).toBe(true);
    });
  });
});
