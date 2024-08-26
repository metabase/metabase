import { renderHook } from "@testing-library/react-hooks";
import type { EChartsType } from "echarts/core";
import type { MutableRefObject } from "react";
import _ from "underscore";

import {
  TOOLTIP_POINTER_MARGIN,
  getTooltipPositionFn,
  useCloseTooltipOnScroll,
} from ".";

describe("useCloseTooltipOnScroll", () => {
  let chartRefMock: MutableRefObject<EChartsType | undefined>;

  beforeEach(() => {
    chartRefMock = {
      current: {
        dispatchAction: jest.fn(),
      } as unknown as EChartsType,
    };
    jest.clearAllMocks();
  });

  it("should attach and remove scroll event listener", () => {
    const addEventListenerSpy = jest.spyOn(window, "addEventListener");
    const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useCloseTooltipOnScroll(chartRefMock));

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true,
    );
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
  });

  it("should hide tooltip on scroll", () => {
    renderHook(() => useCloseTooltipOnScroll(chartRefMock));

    const scrollEvent = new Event("scroll");
    window.dispatchEvent(scrollEvent);

    expect(chartRefMock.current?.dispatchAction).toHaveBeenCalledWith({
      type: "hideTip",
    });
  });
});

describe("getTooltipPositionFn", () => {
  const clientWidth = 1000;
  const clientHeight = 1000;
  const tooltipSize: [number, number] = [100, 50];

  beforeEach(() => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: clientWidth,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      value: clientHeight,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setup = (cardPosition: [number, number]) => {
    const containerRef = { current: document.createElement("div") };
    jest.spyOn(containerRef.current, "getBoundingClientRect").mockReturnValue({
      // relevant position of a card
      x: cardPosition[0],
      y: cardPosition[1],
      // irrelevant properties
      width: 500,
      height: 500,
      top: 50,
      right: 550,
      bottom: 550,
      left: 50,
      toJSON: jest.fn(),
    });

    return getTooltipPositionFn(containerRef);
  };

  it("positions tooltip to the top right when there is sufficient space", () => {
    const cardPosition: [number, number] = [50, 50];
    const relativeMousePoint: [number, number] = [100, 100];
    const getTooltipPosition = setup(cardPosition);
    const relativeTooltipPosition = getTooltipPosition(
      relativeMousePoint,
      null,
      null,
      null,
      {
        contentSize: tooltipSize,
      },
    );

    expect(relativeTooltipPosition).toEqual([
      100 + TOOLTIP_POINTER_MARGIN, // relative tooltip left = relative mouse X + margin
      50 - TOOLTIP_POINTER_MARGIN, // relative tooltip top = relative mouse Y - tooltip height - margin
    ]);
  });

  it("positions tooltip to the top left when there is no space on the right", () => {
    const cardPosition: [number, number] = [500, 50];
    const relativeMousePoint: [number, number] = [450, 100];
    const getTooltipPosition = setup(cardPosition);
    const relativeTooltipPosition = getTooltipPosition(
      relativeMousePoint,
      null,
      null,
      null,
      {
        contentSize: tooltipSize,
      },
    );

    expect(relativeTooltipPosition).toEqual([
      350 - TOOLTIP_POINTER_MARGIN, // relative tooltip left = relative mouse X - tooltip width - margin
      50 - TOOLTIP_POINTER_MARGIN, // relative tooltip top = relative mouse Y - tooltip height - margin
    ]);
  });

  it("positions tooltip to the bottom right when there is no space on the top", () => {
    const cardPosition: [number, number] = [50, 0];
    const relativeMousePoint: [number, number] = [100, 50];
    const getTooltipPosition = setup(cardPosition);
    const relativeTooltipPosition = getTooltipPosition(
      relativeMousePoint,
      null,
      null,
      null,
      {
        contentSize: tooltipSize,
      },
    );

    expect(relativeTooltipPosition).toEqual([
      100 + TOOLTIP_POINTER_MARGIN, // relative tooltip left = relative mouse X + margin
      50 + TOOLTIP_POINTER_MARGIN, // relative tooltip top = relative mouse Y + margin
    ]);
  });

  it("positions tooltip to the bottom left when there is no space on the top and right", () => {
    const cardPosition: [number, number] = [500, 0];
    const relativeMousePoint: [number, number] = [450, 50];
    const getTooltipPosition = setup(cardPosition);
    const relativeTooltipPosition = getTooltipPosition(
      relativeMousePoint,
      null,
      null,
      null,
      {
        contentSize: tooltipSize,
      },
    );

    expect(relativeTooltipPosition).toEqual([
      350 - TOOLTIP_POINTER_MARGIN, // relative tooltip left = relative mouse X - tooltip width - margin
      50 + TOOLTIP_POINTER_MARGIN, // relative tooltip top = relative mouse Y + margin
    ]);
  });
});
