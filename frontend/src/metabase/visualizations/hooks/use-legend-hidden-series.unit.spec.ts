import { act, renderHook } from "@testing-library/react";

import type { LegendPosition } from "metabase-types/api";

import { useLegendHiddenSeries } from "./use-legend-hidden-series";

const setup = (initialPosition: LegendPosition) =>
  renderHook(
    ({ legendPosition }: { legendPosition: LegendPosition }) =>
      useLegendHiddenSeries<string>(legendPosition),
    { initialProps: { legendPosition: initialPosition } },
  );

describe("useLegendHiddenSeries", () => {
  it("should hide the series toggled through the legend", () => {
    const { result } = setup("auto");

    act(() => result.current[1]("a"));

    expect([...result.current[0]]).toEqual(["a"]);
  });

  it("should show every series again when the legend is turned off", () => {
    const { result, rerender } = setup("auto");
    act(() => result.current[1]("a"));

    rerender({ legendPosition: "off" });

    expect(result.current[0].size).toBe(0);
  });

  it("should not hide the series again when the legend comes back", () => {
    const { result, rerender } = setup("right");
    act(() => result.current[1]("a"));

    rerender({ legendPosition: "off" });
    rerender({ legendPosition: "right" });

    expect(result.current[0].size).toBe(0);
  });
});
