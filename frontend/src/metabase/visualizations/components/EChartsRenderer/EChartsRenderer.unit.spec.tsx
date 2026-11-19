import type { EChartsType } from "echarts/core";
import { useState } from "react";

import { createMockChartLayout } from "__support__/echarts";
import {
  act,
  createMockMediaQueryList,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { TimelineEventsBand } from "metabase/visualizations/visualizations/CartesianChart/TimelineEventsBand";

import { DataPointsVisiblePopover } from "../DataPointsVisiblePopover/DataPointsVisiblePopover";

import { EChartsRenderer } from "./EChartsRenderer";

describe("EChartsRenderer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([false, true])(
    "cleans up subscribers with renderer disposed: %s",
    (disposeRenderer) => {
      const warn = jest.spyOn(console, "warn");
      const onInit = jest.fn<void, [EChartsType]>();
      const chartLayout = createMockChartLayout();

      function ChartWithSubscribers({
        subscribers = true,
      }: {
        subscribers?: boolean;
      }) {
        const [chart, setChart] = useState<EChartsType>();
        return (
          <>
            <EChartsRenderer
              option={{}}
              width={300}
              height={200}
              onInit={(instance) => {
                onInit(instance);
                setChart(instance);
              }}
            />
            {subscribers && (
              <DataPointsVisiblePopover
                chartInstance={chart}
                isDashboard={false}
                isVisualizer={false}
              />
            )}
            {subscribers && (
              <TimelineEventsBand
                chartInstance={chart}
                chartSize={{ width: 300, height: 200 }}
                timelineEventsModel={null}
                chartLayout={chartLayout}
                xAxisIndex={0}
              />
            )}
          </>
        );
      }

      const { unmount, rerender } = renderWithProviders(
        <ChartWithSubscribers />,
      );
      const chart = onInit.mock.lastCall?.[0];
      if (!chart) {
        throw new Error("Chart was not initialized");
      }
      const off = jest.spyOn(chart, "off");
      expect(chart.isDisposed()).toBeFalsy();
      if (disposeRenderer) {
        unmount();
      } else {
        rerender(<ChartWithSubscribers subscribers={false} />);
      }
      expect(Boolean(chart.isDisposed())).toBe(disposeRenderer);
      expect(off).toHaveBeenCalledTimes(disposeRenderer ? 0 : 3);
      expect(warn).not.toHaveBeenCalled();
    },
  );

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

    renderWithProviders(
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
