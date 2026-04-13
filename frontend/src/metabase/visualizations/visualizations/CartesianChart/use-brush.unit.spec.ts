import { act, renderHook } from "@testing-library/react";
import type { EChartsType } from "echarts/core";
import type { MutableRefObject, RefObject } from "react";

import { createMockMediaQueryList } from "__support__/ui";

import {
  createZrenderMousedownEvent,
  hasMovedBeyondThreshold,
  useBrush,
} from "./use-brush";

class PointerEventPolyfill extends MouseEvent {
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);

    this.pointerType = init.pointerType ?? "";
    this.isPrimary = init.isPrimary ?? false;
    this.pointerId = init.pointerId ?? 0;
  }
}

if (typeof globalThis.PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

const createMockChartRef = () => {
  const dispatchAction = jest.fn();
  const trigger = jest.fn();
  const getZrender = jest.fn(() => ({ trigger }));
  const chartRef = {
    current: { dispatchAction, getZr: getZrender } as unknown as EChartsType,
  } as MutableRefObject<EChartsType | undefined>;

  return { chartRef, dispatchAction, trigger };
};

const createMockContainerRef = () => {
  const element = document.createElement("div");

  element.getBoundingClientRect = jest.fn(
    () => ({ left: 10, top: 20, width: 400, height: 300 }) as DOMRect,
  );

  const containerRef = { current: element } as RefObject<HTMLDivElement>;

  return { containerRef, el: element };
};

const firePointer = (
  element: HTMLElement,
  type: string,
  {
    clientX = 0,
    clientY = 0,
    isPrimary = true,
    pointerId = 1,
  }: {
    clientX?: number;
    clientY?: number;
    isPrimary?: boolean;
    pointerId?: number;
  } = {},
) => {
  element.dispatchEvent(
    new PointerEvent(type, {
      clientX,
      clientY,
      isPrimary,
      pointerId,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const mockMatchMedia = (results: Record<string, boolean>) => {
  window.matchMedia = (query: string) =>
    createMockMediaQueryList({
      matches: results[query] ?? false,
      media: query,
    });
};

const simulateTouch = () => {
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: 5,
    configurable: true,
  });
  mockMatchMedia({
    "(pointer: coarse)": true,
    "(hover: hover)": false,
  });
};

const simulateDesktop = () => {
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: 0,
    configurable: true,
  });
  mockMatchMedia({
    "(pointer: coarse)": false,
    "(hover: hover)": true,
  });
};

const expectBrushEnabled = (dispatchAction: jest.Mock) => {
  expect(dispatchAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: "takeGlobalCursor", key: "brush" }),
  );
};

const expectBrushDisabled = (dispatchAction: jest.Mock) => {
  expect(dispatchAction).toHaveBeenCalledWith({ type: "takeGlobalCursor" });
};

const expectBrushNotEnabled = (dispatchAction: jest.Mock) => {
  expect(dispatchAction).not.toHaveBeenCalledWith(
    expect.objectContaining({ key: "brush" }),
  );
};

/**
 * Renders useBrush in touch mode, flushes the initial setup,
 * and clears dispatchAction so tests only see subsequent calls.
 */
const setupTouchBrush = (canBrushChart = true, isBrushable = true) => {
  const { chartRef, dispatchAction, trigger } = createMockChartRef();
  const { containerRef, el } = createMockContainerRef();

  renderHook(() =>
    useBrush(chartRef, containerRef, canBrushChart, isBrushable),
  );
  act(() => jest.runAllTimers());
  dispatchAction.mockClear();

  return { el, dispatchAction, trigger };
};

describe("use-brush", () => {
  describe("hasMovedBeyondThreshold", () => {
    it.each([
      { start: { x: 0, y: 0 }, current: { x: 5, y: 5 }, expected: false },
      { start: { x: 0, y: 0 }, current: { x: 10, y: 10 }, expected: true },
      { start: { x: 100, y: 100 }, current: { x: 85, y: 85 }, expected: true },
      { start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, expected: false },
    ])(
      "($start → $current) = $expected (default threshold)",
      ({ start, current, expected }) => {
        expect(hasMovedBeyondThreshold(start, current)).toBe(expected);
      },
    );

    it.each([
      {
        start: { x: 0, y: 0 },
        current: { x: 3, y: 3 },
        threshold: 100,
        expected: false,
      },
      {
        start: { x: 0, y: 0 },
        current: { x: 80, y: 80 },
        threshold: 100,
        expected: true,
      },
    ])(
      "($start → $current, threshold=$threshold) = $expected",
      ({ start, current, threshold, expected }) => {
        expect(hasMovedBeyondThreshold(start, current, threshold)).toBe(
          expected,
        );
      },
    );
  });

  describe("createZrenderMousedownEvent", () => {
    it("calculates correct offsets from client coords and rect", () => {
      const rect = { left: 50, top: 100 } as DOMRect;
      const { offsetX, offsetY, target, event } = createZrenderMousedownEvent(
        { x: 150, y: 250 },
        rect,
      );

      expect(offsetX).toBe(100);
      expect(offsetY).toBe(150);
      expect(target).toBeNull();
      expect(event.preventDefault).toBeInstanceOf(Function);
    });
  });

  describe("useBrush", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe("desktop (non-touch)", () => {
      beforeEach(simulateDesktop);

      it("enables brush when isBrushable is true", () => {
        const { chartRef, dispatchAction } = createMockChartRef();
        const { containerRef } = createMockContainerRef();

        renderHook(() => useBrush(chartRef, containerRef, true, true));
        act(() => jest.runAllTimers());

        expectBrushEnabled(dispatchAction);
      });

      it("disables brush when isBrushable is false", () => {
        const { chartRef, dispatchAction } = createMockChartRef();
        const { containerRef } = createMockContainerRef();

        renderHook(() => useBrush(chartRef, containerRef, true, false));
        act(() => jest.runAllTimers());

        expectBrushDisabled(dispatchAction);
      });
    });

    describe("touch", () => {
      beforeEach(simulateTouch);

      it("disables brush by default", () => {
        const { chartRef, dispatchAction } = createMockChartRef();
        const { containerRef } = createMockContainerRef();

        renderHook(() => useBrush(chartRef, containerRef, true, true));
        act(() => jest.runAllTimers());

        expectBrushDisabled(dispatchAction);
      });

      it("enables brush after long press", () => {
        const { el, dispatchAction } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(500));

        expectBrushEnabled(dispatchAction);
      });

      it("cancels long press on movement", () => {
        const { el, dispatchAction } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        firePointer(el, "pointermove", { clientX: 150, clientY: 100 });
        act(() => jest.advanceTimersByTime(500));

        expectBrushNotEnabled(dispatchAction);
      });

      it("cancels long press on pointer up before timeout", () => {
        const { el, dispatchAction } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(200));
        firePointer(el, "pointerup");
        act(() => jest.advanceTimersByTime(300));

        expectBrushNotEnabled(dispatchAction);
      });

      it("disables brush when finger is lifted after long press", () => {
        const { el, dispatchAction } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(500));
        dispatchAction.mockClear();

        firePointer(el, "pointerup");
        act(() => jest.runAllTimers());

        expectBrushDisabled(dispatchAction);
      });

      it("does not activate when chart does not support brush", () => {
        const { el, dispatchAction } = setupTouchBrush(false, false);

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(500));

        expect(dispatchAction).not.toHaveBeenCalled();
      });

      it("allows scroll (touchmove) before long press", () => {
        const { el } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(200));

        const touchmove = new Event("touchmove", { cancelable: true });
        el.dispatchEvent(touchmove);

        expect(touchmove.defaultPrevented).toBe(false);
      });

      it("prevents scroll (touchmove) after long press", () => {
        const { el } = setupTouchBrush();

        firePointer(el, "pointerdown", { clientX: 100, clientY: 100 });
        act(() => jest.advanceTimersByTime(500));

        const touchmove = new Event("touchmove", { cancelable: true });
        el.dispatchEvent(touchmove);

        expect(touchmove.defaultPrevented).toBe(true);
      });

      it("cancels long press when a second finger touches (pinch-to-zoom)", () => {
        const { el, dispatchAction } = setupTouchBrush();

        // First finger down
        firePointer(el, "pointerdown", {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
          pointerId: 1,
        });

        // Second finger down before timer fires
        firePointer(el, "pointerdown", {
          clientX: 200,
          clientY: 100,
          isPrimary: false,
          pointerId: 2,
        });

        // Wait past the long press duration
        act(() => jest.advanceTimersByTime(500));

        expectBrushNotEnabled(dispatchAction);
      });

      it("deactivates brush when a second finger touches during active brush", () => {
        const { el, dispatchAction } = setupTouchBrush();

        // First finger down, wait for long press to activate brush
        firePointer(el, "pointerdown", {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
          pointerId: 1,
        });
        act(() => jest.advanceTimersByTime(500));
        expectBrushEnabled(dispatchAction);
        dispatchAction.mockClear();

        // Second finger down while brush is active
        firePointer(el, "pointerdown", {
          clientX: 200,
          clientY: 100,
          isPrimary: false,
          pointerId: 2,
        });
        act(() => jest.runAllTimers());

        expectBrushDisabled(dispatchAction);
      });

      it("does not freeze brush mode after second finger tap during active brush", () => {
        const { el, dispatchAction } = setupTouchBrush();

        // Long press activates brush
        firePointer(el, "pointerdown", {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
          pointerId: 1,
        });
        act(() => jest.advanceTimersByTime(500));
        expectBrushEnabled(dispatchAction);
        dispatchAction.mockClear();

        // Second finger tap while brush is active
        firePointer(el, "pointerdown", {
          clientX: 200,
          clientY: 100,
          isPrimary: false,
          pointerId: 2,
        });

        // disableBrush must be deferred — calling it synchronously during
        // the pointer event causes ECharts to get stuck with brush enabled.
        expect(dispatchAction).not.toHaveBeenCalled();

        act(() => jest.runAllTimers());
        expectBrushDisabled(dispatchAction);
        dispatchAction.mockClear();

        // Both fingers released
        firePointer(el, "pointerup", { isPrimary: false, pointerId: 2 });
        firePointer(el, "pointerup", { isPrimary: true, pointerId: 1 });
        act(() => jest.runAllTimers());

        // Brush should not be re-enabled — no stuck brush mode
        expectBrushNotEnabled(dispatchAction);

        // A new long press should work normally
        firePointer(el, "pointerdown", {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
          pointerId: 1,
        });
        act(() => jest.advanceTimersByTime(500));
        expectBrushEnabled(dispatchAction);
      });
    });
  });
});
