import { act, render, renderHook } from "__support__/ui";

import { useMonitorCSS } from "./use-monitor-css";

describe("useMonitorCSS", () => {
  let originalError: typeof console.error;

  beforeAll(() => {
    originalError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call console.error if there are elements whose class is the string "undefined"', async () => {
    jest.useFakeTimers();

    renderHook(() => useMonitorCSS(1000));
    render(<div className="undefined" />);

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(console.error).toHaveBeenCalledWith(
      "Found elements with class 'undefined':",
      expect.any(NodeList),
    );
  });

  it('should not call console.error if no elements have the class "undefined"', () => {
    jest.useFakeTimers();

    renderHook(() => useMonitorCSS(1000));

    render(<div className="not-undefined" />);

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(console.error).not.toHaveBeenCalled();
  });

  it("should not call console.error on elements whose class is literally undefined", () => {
    jest.useFakeTimers();

    renderHook(() => useMonitorCSS(1000));

    render(<div className={undefined} />);

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(console.error).not.toHaveBeenCalled();
  });
  it("should not alert twice for the same element", () => {
    jest.useFakeTimers();

    renderHook(() => useMonitorCSS(1000));

    render(<div className="undefined" />);

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(console.error).toHaveBeenCalledWith(
      "Found elements with class 'undefined':",
      expect.any(NodeList),
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
