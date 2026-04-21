import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import { render, screen } from "__support__/ui";

import type { NumericInputProps } from "./NumericInput";
import { NumericInput } from "./NumericInput";

const NumericInputTest = ({ onChange, ...props }: NumericInputProps) => {
  const [value, setValue] = useState<number>();

  const handleChange = useCallback(
    (value: number | undefined, inputValue: string) => {
      setValue(value);
      onChange?.(value, inputValue);
    },
    [onChange],
  );

  return <NumericInput {...props} value={value} onChange={handleChange} />;
};

describe("NumericInput", () => {
  it("should set number", async () => {
    const onChange = jest.fn();

    render(<NumericInputTest onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "123");

    expect(onChange).toHaveBeenLastCalledWith(123, "123");
  });

  it("should clear number", async () => {
    const onChange = jest.fn();

    render(<NumericInputTest onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "123");
    await userEvent.clear(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith(undefined, "");
  });
});
