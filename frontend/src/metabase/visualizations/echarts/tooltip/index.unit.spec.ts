import { renderHook } from "@testing-library/react-hooks";
import type { EChartsType } from "echarts/core";
import type { MutableRefObject } from "react";
import _ from "underscore";

import { useCloseTooltipOnScroll } from ".";

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
