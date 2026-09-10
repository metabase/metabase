import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  VizHeuristicProvider,
  type VizReport,
  useResolvedDisplay,
  useVizHeuristic,
} from "./VizHeuristicContext";
import { ONE_BY_ONE_COUNT, TIME_SERIES } from "./__fixtures__/inputs";
import type { VizHeuristic, VizInput } from "./types";

const ALWAYS_BAR: VizHeuristic = {
  id: "always-bar",
  label: "Always bar",
  description: "",
  resolve: jest.fn(() => ({ display: "bar" as const })),
};

function wrapperFor(
  heuristic: VizHeuristic,
  onReport?: (r: VizReport) => void,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <VizHeuristicProvider heuristic={heuristic} onReport={onReport}>
        {children}
      </VizHeuristicProvider>
    );
  };
}

describe("useVizHeuristic", () => {
  it("is null outside a provider", () => {
    const { result } = renderHook(() => useVizHeuristic());
    expect(result.current).toBeNull();
  });

  it("exposes the heuristic inside a provider", () => {
    const { result } = renderHook(() => useVizHeuristic(), {
      wrapper: wrapperFor(ALWAYS_BAR),
    });
    expect(result.current?.heuristic).toBe(ALWAYS_BAR);
  });
});

describe("useResolvedDisplay", () => {
  beforeEach(() => {
    jest.mocked(ALWAYS_BAR.resolve).mockClear();
  });

  describe("outside a provider", () => {
    it("returns the hint verbatim", () => {
      const input: VizInput = {
        ...TIME_SERIES,
        hint: { display: "area", settings: { "graph.dimensions": ["x"] } },
      };
      const { result } = renderHook(() => useResolvedDisplay("t", input));
      expect(result.current).toEqual({
        display: "area",
        settings: { "graph.dimensions": ["x"] },
      });
    });

    it("returns the legacy default without a hint", () => {
      const { result } = renderHook(() =>
        useResolvedDisplay("t", ONE_BY_ONE_COUNT),
      );
      expect(result.current).toEqual({ display: "scalar" });
    });
  });

  describe("inside a provider", () => {
    it("resolves through the heuristic and reports the decision", () => {
      const onReport = jest.fn();
      const input: VizInput = { ...TIME_SERIES, hint: { display: "line" } };
      const { result } = renderHook(
        () => useResolvedDisplay("tile-1", input, "By Created At"),
        { wrapper: wrapperFor(ALWAYS_BAR, onReport) },
      );

      expect(result.current).toEqual({ display: "bar" });
      expect(onReport).toHaveBeenCalledTimes(1);
      expect(onReport).toHaveBeenCalledWith({
        tileId: "tile-1",
        title: "By Created At",
        display: "bar",
        hintDisplay: "line",
        heuristicId: "always-bar",
      });
    });

    it("memoizes the decision for the same input fields", () => {
      const onReport = jest.fn();
      const { rerender } = renderHook(
        ({ input }: { input: VizInput }) => useResolvedDisplay("t", input),
        {
          wrapper: wrapperFor(ALWAYS_BAR, onReport),
          initialProps: { input: TIME_SERIES },
        },
      );

      rerender({ input: { ...TIME_SERIES } });

      expect(ALWAYS_BAR.resolve).toHaveBeenCalledTimes(1);
      expect(onReport).toHaveBeenCalledTimes(1);
    });

    it("re-resolves when the columns change", () => {
      const { rerender } = renderHook(
        ({ input }: { input: VizInput }) => useResolvedDisplay("t", input),
        {
          wrapper: wrapperFor(ALWAYS_BAR),
          initialProps: { input: TIME_SERIES },
        },
      );

      rerender({ input: { ...TIME_SERIES, cols: [...TIME_SERIES.cols] } });

      expect(ALWAYS_BAR.resolve).toHaveBeenCalledTimes(2);
    });

    it("keeps reporting to the latest onReport after it changes", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { rerender } = renderHook(
        ({ input }: { input: VizInput }) => useResolvedDisplay("t", input),
        {
          wrapper: ({ children }) => (
            <VizHeuristicProvider heuristic={ALWAYS_BAR} onReport={first}>
              {children}
            </VizHeuristicProvider>
          ),
          initialProps: { input: TIME_SERIES },
        },
      );
      expect(first).toHaveBeenCalledTimes(1);

      const { result } = renderHook(
        ({ input }: { input: VizInput }) => useResolvedDisplay("t2", input),
        {
          wrapper: ({ children }) => (
            <VizHeuristicProvider heuristic={ALWAYS_BAR} onReport={second}>
              {children}
            </VizHeuristicProvider>
          ),
          initialProps: { input: ONE_BY_ONE_COUNT },
        },
      );
      rerender({ input: ONE_BY_ONE_COUNT });

      expect(result.current.display).toBe("bar");
      expect(second).toHaveBeenCalledWith(
        expect.objectContaining({ tileId: "t2", display: "bar" }),
      );
    });
  });
});
