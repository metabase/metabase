import { act, renderHook } from "@testing-library/react";

import { useSdkQuestionContext } from "../context";

import { useStageChangeTooltip } from "./use-stage-change-tooltip";

jest.mock("../context", () => ({
  useSdkQuestionContext: jest.fn(() => ({ lastVisibleStageIndex: 1 })),
}));

const mockContext = useSdkQuestionContext as jest.MockedFunction<
  typeof useSdkQuestionContext
>;

const setup = ({
  lastVisibleStageIndex,
}: {
  lastVisibleStageIndex: number;
}) => {
  mockContext.mockReturnValue({
    lastVisibleStageIndex,
  } as ReturnType<typeof useSdkQuestionContext>);
};

describe("useStageChangeTooltip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setup({ lastVisibleStageIndex: 1 });
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
      setup({ lastVisibleStageIndex: from });
      const { result, rerender } = renderHook(() => useStageChangeTooltip());

      setup({ lastVisibleStageIndex: to });
      rerender();

      expect(result.current).toBe(expected);
    },
  );

  it("auto-hides after 3 seconds", () => {
    const { result, rerender } = renderHook(() => useStageChangeTooltip());

    setup({ lastVisibleStageIndex: 0 });
    rerender();
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(3000));
    expect(result.current).toBe(false);
  });

  it("hides tooltip when stage index increases before timeout", () => {
    const { result, rerender } = renderHook(() => useStageChangeTooltip());

    setup({ lastVisibleStageIndex: 0 });
    rerender();
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(1000));

    setup({ lastVisibleStageIndex: 1 });
    rerender();
    expect(result.current).toBe(false);
  });

  it("resets timer on consecutive stage decreases", () => {
    setup({ lastVisibleStageIndex: 2 });
    const { result, rerender } = renderHook(() => useStageChangeTooltip());

    setup({ lastVisibleStageIndex: 1 });
    rerender();
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(1500));

    setup({ lastVisibleStageIndex: 0 });
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
