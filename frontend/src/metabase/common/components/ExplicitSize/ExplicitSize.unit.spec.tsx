import { act, render, screen } from "@testing-library/react";
import { forwardRef } from "react";

import { ExplicitSize } from "./ExplicitSize";

jest.mock("metabase/utils/resize-observer", () => {
  const callbacks: Map<Element, (entry: Partial<ResizeObserverEntry>) => void> =
    new Map();

  return {
    __esModule: true,
    default: {
      subscribe: (
        target: Element,
        callback: (entry: Partial<ResizeObserverEntry>) => void,
      ) => {
        callbacks.set(target, callback);
      },
      unsubscribe: (target: Element) => {
        callbacks.delete(target);
      },
    },
  };
});

// A child that renders nothing until it has content, mirroring PivotTable,
// which returns null on its first render (before its data is pivoted) and only
// later renders a measurable element. See metabase#51926.
const ConditionalBase = forwardRef<
  HTMLDivElement,
  { width: number | null; height: number | null; hasContent: boolean }
>(function ConditionalBase({ width, height, hasContent }, ref) {
  if (!hasContent) {
    return null;
  }
  return (
    <div ref={ref} data-testid="sized">
      {String(width)}x{String(height)}
    </div>
  );
});

const ConditionalSizedComponent = ExplicitSize<{
  width: number | null;
  height: number | null;
  hasContent: boolean;
}>()(ConditionalBase);

describe("ExplicitSize", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should measure a child that renders content only after mount and pass it non-null dimensions (metabase#51926)", () => {
    // Regression test for the pivot table rendering blank until resized.
    // PivotTable returns null on its first render, so there is no element for
    // ExplicitSize to measure at mount. When it later renders content, the size
    // must be recalculated even though no resize event ever fires — otherwise
    // the child stays stuck with null dimensions and never lays out.
    const { rerender } = render(
      <ConditionalSizedComponent hasContent={false} />,
    );

    // Mount: the child renders nothing, so there is nothing to measure.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("sized")).not.toBeInTheDocument();

    // The child now renders a measurable element. jsdom reports 0x0 by default,
    // so stub a real size — there is no resize event to supply one.
    rerender(<ConditionalSizedComponent hasContent={true} />);
    const element = screen.getByTestId("sized");
    jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
    } as DOMRect);
    expect(element).toHaveTextContent("nullxnull");

    // ExplicitSize re-runs measurement on the next tick once content appears.
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId("sized")).toHaveTextContent("400x300");
  });
});
