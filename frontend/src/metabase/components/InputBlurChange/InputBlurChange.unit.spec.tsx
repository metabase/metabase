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
});

function setup({
  value = "",
  placeholder = "Type some texto",
}: Partial<InputBlurChangeProps> = {}) {
  const onChange = jest.fn();
  const onBlurChange = jest.fn(e => e.target.value);

  render(
    <InputBlurChange
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onBlurChange={onBlurChange}
    />,
  );

  return {
    props: { value, placeholder },
    mocks: { onChange, onBlurChange },
  };
}
