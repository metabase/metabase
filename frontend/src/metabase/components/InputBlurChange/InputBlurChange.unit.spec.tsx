import userEvent from "@testing-library/user-event";
import { render, screen, cleanup } from "__support__/ui";
import type { InputBlurChangeProps } from "./InputBlurChange";
import InputBlurChange from "./InputBlurChange";

describe("InputBlurChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger "onBlurChange" on input blur', () => {
    const {
      props: { placeholder },
      mocks: { onBlurChange },
    } = setup();

    const inputEl = screen.getByPlaceholderText(placeholder);
    inputEl.focus();
    inputEl.blur();

    // should not be triggered if value hasn't changed
    expect(onBlurChange).toHaveBeenCalledTimes(0);

    userEvent.type(inputEl, "test");
    inputEl.blur();

    expect(onBlurChange).toHaveBeenCalledTimes(1);
    expect(onBlurChange.mock.results[0].value).toBe("test");
  });

  it('should trigger "onBlurChange" on component unmount', () => {
    const {
      props: { placeholder },
      mocks: { onBlurChange },
    } = setup();

    userEvent.type(screen.getByPlaceholderText(placeholder), "test");

    cleanup();

    expect(onBlurChange).toHaveBeenCalledTimes(1);
    expect(onBlurChange.mock.results[0].value).toBe("test");
  });

  it("should set `internalValue` to the normalized value even if the normalized value is the same as the previous one", () => {
    const value = "/";
    setup({ value, normalize: value => (value as string).trim() });
    const input = screen.getByDisplayValue(value) as HTMLInputElement;
    userEvent.clear(input);
    userEvent.type(input, "           /         ");

    const normalizedValue = "/";
    expect(input.value).toEqual(normalizedValue);
  });
});

function setup({
  value = "",
  placeholder = "Type some texto",
  normalize,
}: Partial<InputBlurChangeProps> = {}) {
  const onChange = jest.fn();
  const onBlurChange = jest.fn(e => e.target.value);

  render(
    <InputBlurChange
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onBlurChange={onBlurChange}
      normalize={normalize}
    />,
  );

  return {
    props: { value, placeholder },
    mocks: { onChange, onBlurChange },
  };
}
