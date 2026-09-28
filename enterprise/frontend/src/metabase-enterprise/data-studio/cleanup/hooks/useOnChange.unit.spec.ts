import { renderHook } from "@testing-library/react";

import { useOnChange } from "./useOnChange";

describe("useOnChange", () => {
  it("does not fire on the initial render", () => {
    const onChange = jest.fn();
    renderHook(() => useOnChange(1, onChange));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires with the new value when it changes", () => {
    const onChange = jest.fn();
    const { rerender } = renderHook(
      ({ value }) => useOnChange(value, onChange),
      {
        initialProps: { value: 1 },
      },
    );

    rerender({ value: 2 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("does not fire when the value is unchanged", () => {
    const onChange = jest.fn();
    const { rerender } = renderHook(
      ({ value }) => useOnChange(value, onChange),
      {
        initialProps: { value: 1 },
      },
    );

    rerender({ value: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not fire while disabled, and does not treat the next enabled value as a change once re-enabled", () => {
    const onChange = jest.fn();
    const { rerender } = renderHook(
      ({ value, enabled }) => useOnChange(value, onChange, { enabled }),
      { initialProps: { value: 1, enabled: false } },
    );

    rerender({ value: 2, enabled: false });
    expect(onChange).not.toHaveBeenCalled();

    rerender({ value: 3, enabled: true });
    expect(onChange).not.toHaveBeenCalled();

    rerender({ value: 4, enabled: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("calls the latest onChange even if it changed identity after the last enabled run", () => {
    const firstOnChange = jest.fn();
    const secondOnChange = jest.fn();
    const { rerender } = renderHook(
      ({ value, onChange }) => useOnChange(value, onChange),
      { initialProps: { value: 1, onChange: firstOnChange } },
    );

    rerender({ value: 1, onChange: secondOnChange });
    rerender({ value: 2, onChange: secondOnChange });

    expect(firstOnChange).not.toHaveBeenCalled();
    expect(secondOnChange).toHaveBeenCalledWith(2);
  });
});
