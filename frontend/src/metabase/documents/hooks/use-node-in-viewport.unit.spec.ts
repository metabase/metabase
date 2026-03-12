import { renderHook } from "@testing-library/react";

import { useNodeInViewport } from "./use-node-in-viewport";

const mockUseIntersection = jest.fn();

jest.mock("@mantine/hooks", () => ({
  useIntersection: (...args: unknown[]) => mockUseIntersection(...args),
}));

jest.mock("metabase/documents/contexts/ScrollContainerContext", () => ({
  useScrollContainer: () => null,
}));

describe("useNodeInViewport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats null entry (initial state) as in-viewport", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: null,
    });

    const { result } = renderHook(() => useNodeInViewport());

    expect(result.current.isInViewport).toBe(true);
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

  it("passes rootMargin 50% to useIntersection", () => {
    mockUseIntersection.mockReturnValue({
      ref: jest.fn(),
      entry: null,
    });

    renderHook(() => useNodeInViewport());

    expect(mockUseIntersection).toHaveBeenCalledWith(
      expect.objectContaining({
        rootMargin: "50%",
        threshold: 0,
      }),
    );
  });
});
