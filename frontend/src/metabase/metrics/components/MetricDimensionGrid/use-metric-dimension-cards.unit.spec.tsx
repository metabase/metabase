import { act, renderHook } from "@testing-library/react";

import type { MetricId } from "metabase-types/api/metric";

import { useVisibleDimensions } from "./use-metric-dimension-cards";
import type { OverviewDimension } from "./utils";

const DIMENSIONS = Array.from({ length: 15 }, (_, index) => ({
  dimensionId: `dimension-${index + 1}`,
  dimensionType: "category" as const,
  label: `Dimension ${index + 1}`,
}));

function getVisibleIds(cards: OverviewDimension[]) {
  return cards.map((card) => card.dimensionId);
}

describe("useVisibleDimensions", () => {
  it("shows 4 dimensions, auto-loads through 10, then shows 4 per click", () => {
    const { result } = renderHook(() => useVisibleDimensions(DIMENSIONS, 1));

    expect(getVisibleIds(result.current.cards)).toEqual(
      DIMENSIONS.slice(0, 4).map((dimension) => dimension.dimensionId),
    );
    expect(result.current.canAutoLoad).toBe(true);

    act(() => result.current.autoLoad());

    expect(getVisibleIds(result.current.cards)).toEqual(
      DIMENSIONS.slice(0, 10).map((dimension) => dimension.dimensionId),
    );
    expect(result.current.canAutoLoad).toBe(false);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.showMore());

    expect(getVisibleIds(result.current.cards)).toEqual(
      DIMENSIONS.slice(0, 14).map((dimension) => dimension.dimensionId),
    );

    act(() => result.current.showMore());

    expect(getVisibleIds(result.current.cards)).toEqual(
      DIMENSIONS.map((dimension) => dimension.dimensionId),
    );
    expect(result.current.hasMore).toBe(false);
  });

  it("auto-loads all remaining dimensions when there are fewer than 10", () => {
    const dimensions = DIMENSIONS.slice(0, 7);
    const { result } = renderHook(() => useVisibleDimensions(dimensions, 1));

    act(() => result.current.autoLoad());

    expect(getVisibleIds(result.current.cards)).toEqual(
      dimensions.map((dimension) => dimension.dimensionId),
    );
    expect(result.current.canAutoLoad).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it("resets to 4 dimensions when navigating to another metric", () => {
    const { result, rerender } = renderHook(
      ({ metricId }: { metricId: MetricId }) =>
        useVisibleDimensions(DIMENSIONS, metricId),
      { initialProps: { metricId: 1 } },
    );

    act(() => result.current.autoLoad());
    act(() => result.current.showMore());
    expect(result.current.cards).toHaveLength(14);

    rerender({ metricId: 2 });

    expect(result.current.cards).toHaveLength(4);
  });
});
