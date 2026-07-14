import { act, render, screen } from "@testing-library/react";
import type { EChartsType } from "echarts/core";
import { useLayoutEffect, useRef } from "react";

import { createMockMediaQueryList } from "__support__/ui";

import { EChartsRenderer } from "./EChartsRenderer";

type LayoutObserverProps = {
  width: number;
  onLayout: (width: number | undefined) => void;
};

function LayoutObserver({ width, onLayout }: LayoutObserverProps) {
  const chartRef = useRef<EChartsType>();

  useLayoutEffect(() => {
    onLayout(chartRef.current?.getWidth());
  }, [width, onLayout]);

  return (
    <EChartsRenderer
      option={{}}
      width={width}
      height={300}
      onInit={(chart) => {
        chartRef.current = chart;
      }}
    />
  );
}

describe("EChartsRenderer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should resize the SVG before parent layout effects run (#74181)", () => {
    const onLayout = jest.fn<void, [number | undefined]>();
    const { rerender } = render(
      <LayoutObserver width={300} onLayout={onLayout} />,
    );

    rerender(<LayoutObserver width={400} onLayout={onLayout} />);

    expect(onLayout).toHaveBeenLastCalledWith(400);
  });

  it("should resize synchronously when print media changes (#74181)", () => {
    const printMediaTarget = new EventTarget();
    const printMediaQuery = createMockMediaQueryList({
      addEventListener:
        printMediaTarget.addEventListener.bind(printMediaTarget),
      removeEventListener:
        printMediaTarget.removeEventListener.bind(printMediaTarget),
    });
    jest.spyOn(window, "matchMedia").mockReturnValue(printMediaQuery);
    const onInit = jest.fn<void, [EChartsType]>();

    render(
      <EChartsRenderer option={{}} width={300} height={200} onInit={onInit} />,
    );
    const chartElement = screen.getByTestId("chart-container");
    Object.defineProperties(chartElement, {
      offsetWidth: { value: 400 },
      offsetHeight: { value: 250 },
    });

    act(() => printMediaTarget.dispatchEvent(new Event("change")));

    expect(onInit.mock.lastCall?.[0].getWidth()).toBe(400);
    expect(onInit.mock.lastCall?.[0].getHeight()).toBe(250);
  });
});
