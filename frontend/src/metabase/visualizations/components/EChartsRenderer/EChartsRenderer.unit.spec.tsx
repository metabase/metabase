import { act, render, screen } from "@testing-library/react";
import type { EChartsType } from "echarts/core";

import { createMockMediaQueryList } from "__support__/ui";

import { EChartsRenderer } from "./EChartsRenderer";

describe("EChartsRenderer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
