import userEvent from "@testing-library/user-event";

import { cleanup, render, screen } from "__support__/ui";

import type { TextareaBlurChangeProps } from "./TextareaBlurChange";
import { TextareaBlurChange } from "./TextareaBlurChange";

function setup({
  value = "",
  placeholder = "Type some text",
  normalize,
}: Partial<TextareaBlurChangeProps> = {}) {
  const onChange = jest.fn();
  const onBlurChange = jest.fn((e) => e.target.value);

  render(
    <TextareaBlurChange
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onBlurChange={onBlurChange}
      normalize={normalize}
    />,
  );

  return { placeholder, value, onBlurChange, onChange };
}

describe("TextareaBlurChange", () => {
  it('should trigger "onBlurChange" on input blur', async () => {
    const { placeholder, onBlurChange } = setup();

    const inputEl = screen.getByPlaceholderText(placeholder);
    inputEl.focus();
    inputEl.blur();

    // should not be triggered if value hasn't changed
    expect(onBlurChange).toHaveBeenCalledTimes(0);

    await userEvent.type(inputEl, "test");
    inputEl.blur();

    expect(onBlurChange).toHaveBeenCalledTimes(1);
    expect(onBlurChange.mock.results[0].value).toBe("test");
  });

  it('should trigger "onBlurChange" on component unmount', async () => {
    const { placeholder, onBlurChange } = setup();

    await userEvent.type(screen.getByPlaceholderText(placeholder), "test");

    cleanup();

    expect(onBlurChange).toHaveBeenCalledTimes(1);
    expect(onBlurChange.mock.results[0].value).toBe("test");
  });

  it("should set `internalValue` to the normalized value even if the normalized value is the same as the previous one", async () => {
    const value = "/";
    setup({ value, normalize: (value) => (value as string).trim() });
    const input = screen.getByDisplayValue(value) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "           /         ");

    const normalizedValue = "/";
    expect(input.value).toEqual(normalizedValue);
  });
});
