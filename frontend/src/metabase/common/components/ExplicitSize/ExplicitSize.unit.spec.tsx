import { act, render, screen } from "@testing-library/react";
import { forwardRef } from "react";

import resizeObserver from "metabase/utils/resize-observer";

import { ExplicitSize } from "./ExplicitSize";

jest.mock("metabase/utils/resize-observer", () => {
  const callbacks = new Map<
    Element,
    (entry: Partial<ResizeObserverEntry>) => void
  >();

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
      _trigger: (target: Element, entry: Partial<ResizeObserverEntry>) => {
        callbacks.get(target)?.(entry);
      },
    },
  };
});

const triggerResize = (
  target: Element,
  entry: Partial<ResizeObserverEntry>,
) => {
  act(() => {
    (
      resizeObserver as unknown as {
        _trigger: (
          target: Element,
          entry: Partial<ResizeObserverEntry>,
        ) => void;
      }
    )._trigger(target, entry);
    // flush the trailing call of the throttled size update
    jest.advanceTimersByTime(500);
  });
};

const renderSpy = jest.fn();

const Base = forwardRef<
  HTMLDivElement,
  { width: number | null; height: number | null }
>(function Base({ width, height }, ref) {
  renderSpy();
  return (
    <div ref={ref} data-testid="sized">
      {String(width)}x{String(height)}
    </div>
  );
});

const SizedComponent = ExplicitSize<{
  width: number | null;
  height: number | null;
}>()(Base);

const createEntry = (
  target: Element,
  inlineSize: number,
  blockSize: number,
): Partial<ResizeObserverEntry> =>
  ({
    target,
    borderBoxSize: [{ inlineSize, blockSize }],
    contentRect: {
      width: inlineSize,
      height: blockSize,
    },
  }) as unknown as Partial<ResizeObserverEntry>;

describe("ExplicitSize", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    renderSpy.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should pass the size from resize observer entries to the wrapped component", () => {
    render(<SizedComponent />);
    const element = screen.getByTestId("sized");

    triggerResize(element, createEntry(element, 400, 866.812));

    expect(screen.getByTestId("sized")).toHaveTextContent("400x866.812");
  });

  it("should ignore sub-pixel size changes between measurement sources", () => {
    render(<SizedComponent />);
    const element = screen.getByTestId("sized");

    triggerResize(element, createEntry(element, 400, 866.812));
    renderSpy.mockClear();

    // getBoundingClientRect reports full-precision values, while
    // @juggle/resize-observer rounds box sizes to three decimals
    jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 866.8125,
    } as DOMRect);

    // an entry for another element falls back to getBoundingClientRect()
    triggerResize(element, { target: document.body });

    expect(renderSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("sized")).toHaveTextContent("400x866.812");
  });

  it("should re-render when the size changes by a pixel or more", () => {
    render(<SizedComponent />);
    const element = screen.getByTestId("sized");

    triggerResize(element, createEntry(element, 400, 866.812));

    triggerResize(element, createEntry(element, 400, 868));

    expect(screen.getByTestId("sized")).toHaveTextContent("400x868");
  });
});
