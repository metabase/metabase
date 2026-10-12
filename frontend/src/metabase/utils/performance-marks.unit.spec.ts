import {
  PERFORMANCE_MARKS,
  markOnce,
  resetPerformanceMarks,
} from "./performance-marks";

// jsdom implements `performance.now` and nothing else, so the API this module
// guards against being absent is absent here too. Stub the one method it uses.
function stubPerformanceMark() {
  const mark = jest.fn();
  Object.defineProperty(performance, "mark", {
    value: mark,
    configurable: true,
    writable: true,
  });
  return mark;
}

describe("markOnce", () => {
  beforeEach(() => {
    resetPerformanceMarks();
    // Unjustified type cast. FIXME
    delete (performance as unknown as Record<string, unknown>).mark;
  });

  it("records the mark", () => {
    const mark = stubPerformanceMark();

    markOnce(PERFORMANCE_MARKS.appMounted);

    expect(mark).toHaveBeenCalledWith(PERFORMANCE_MARKS.appMounted);
  });

  it("ignores every call after the first, so a remount cannot move the reading", () => {
    const mark = stubPerformanceMark();

    markOnce(PERFORMANCE_MARKS.pageReady);
    markOnce(PERFORMANCE_MARKS.pageReady);
    markOnce(PERFORMANCE_MARKS.pageReady);

    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("keeps the marks apart", () => {
    const mark = stubPerformanceMark();

    markOnce(PERFORMANCE_MARKS.appMounted);
    markOnce(PERFORMANCE_MARKS.pageReady);

    expect(mark.mock.calls.flat()).toEqual([
      PERFORMANCE_MARKS.appMounted,
      PERFORMANCE_MARKS.pageReady,
    ]);
  });

  it("does nothing where the Performance API is absent, as in static-viz", () => {
    expect(() => markOnce(PERFORMANCE_MARKS.appMounted)).not.toThrow();
  });
});
