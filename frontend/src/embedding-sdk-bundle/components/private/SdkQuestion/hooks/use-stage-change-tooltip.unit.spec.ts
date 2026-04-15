import { act, renderHook } from "@testing-library/react";

import { getLastVisibleStageIndex } from "../utils/stages";

import { useStageChangeTooltip } from "./use-stage-change-tooltip";

jest.mock("../context", () => ({
  useSdkQuestionContext: jest.fn(() => ({
    question: {
      query: () => ({}),
    },
  })),
}));

jest.mock("../utils/stages", () => ({
  getLastVisibleStageIndex: jest.fn(() => 1),
}));

const mockStageIndex = getLastVisibleStageIndex as jest.MockedFunction<
  typeof getLastVisibleStageIndex
>;

describe("useStageChangeTooltip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockStageIndex.mockReturnValue(1);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns false initially", () => {
    const { result } = renderHook(() => useStageChangeTooltip());
    expect(result.current).toBe(false);
  });

  it.each([
    { from: 1, to: 0, expected: true, desc: "decreases" },
    { from: 2, to: 0, expected: true, desc: "decreases by more than 1" },
    { from: 0, to: 1, expected: false, desc: "increases" },
    { from: 1, to: 1, expected: false, desc: "stays the same" },
  ])(
    "returns $expected when stage index $desc ($from → $to)",
    ({ from, to, expected }) => {
      mockStageIndex.mockReturnValue(from);
      const { result, rerender } = renderHook(() => useStageChangeTooltip());

      mockStageIndex.mockReturnValue(to);
      rerender();

      expect(result.current).toBe(expected);
    },
  );

  it("auto-hides after 3 seconds", () => {
    const { result, rerender } = renderHook(() => useStageChangeTooltip());

    mockStageIndex.mockReturnValue(0);
    rerender();
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(3000));
    expect(result.current).toBe(false);
  });

  it("resets timer on consecutive stage decreases", () => {
    mockStageIndex.mockReturnValue(2);
    const { result, rerender } = renderHook(() => useStageChangeTooltip());

    mockStageIndex.mockReturnValue(1);
    rerender();
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(1500));

    mockStageIndex.mockReturnValue(0);
    rerender();
    expect(result.current).toBe(true);

    // first timer (1500ms remaining) should be cleared, not fire here
    act(() => jest.advanceTimersByTime(1500));
    expect(result.current).toBe(true);

    // second timer fires at 3000ms from second decrease
    act(() => jest.advanceTimersByTime(1500));
    expect(result.current).toBe(false);
  });
});
