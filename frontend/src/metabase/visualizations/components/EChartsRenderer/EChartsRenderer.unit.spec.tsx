import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";

import { createMockMediaQueryList } from "__support__/ui";

import { EChartsRenderer } from "./EChartsRenderer";

type LayoutObserverProps = {
  width: number;
  onLayout: (width: string | null) => void;
};

function LayoutObserver({ width, onLayout }: LayoutObserverProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    /* eslint-disable testing-library/no-node-access -- This test observes SVG state during the layout-effect phase. */
    const svgWidth = chartRef.current
      ?.querySelector("svg")
      ?.getAttribute("width");
    /* eslint-enable testing-library/no-node-access */
    onLayout(svgWidth ?? null);
  }, [width, onLayout]);

  return (
    <EChartsRenderer ref={chartRef} option={{}} width={width} height={300} />
  );
}

describe("EChartsRenderer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should resize the SVG before parent layout effects run (#74181)", () => {
    const onLayout = jest.fn<void, [string | null]>();
    const { rerender } = render(
      <LayoutObserver width={300} onLayout={onLayout} />,
    );

    rerender(<LayoutObserver width={400} onLayout={onLayout} />);

    expect(onLayout).toHaveBeenLastCalledWith("400");
  });

  it("should resize synchronously when print media changes (#74181)", () => {
    let printListener: EventListener | undefined;
    const printMediaQuery = createMockMediaQueryList({
      addEventListener: jest.fn((event, listener) => {
        if (event === "change" && typeof listener === "function") {
          printListener = listener;
        }
      }),
    });
    jest.spyOn(window, "matchMedia").mockReturnValue(printMediaQuery);

    render(<EChartsRenderer option={{}} width={300} height={200} />);
    const chartElement = screen.getByTestId("chart-container");
    Object.defineProperties(chartElement, {
      offsetWidth: { value: 400 },
      offsetHeight: { value: 250 },
    });

    const listener = printListener;
    if (!listener) {
      throw new Error("Print media listener was not registered");
    }
    act(() => listener(new Event("change")));

    /* eslint-disable-next-line testing-library/no-node-access -- ECharts writes dimensions directly to the SVG. */
    expect(chartElement.querySelector("svg")).toHaveAttribute("width", "400");
  });
});
