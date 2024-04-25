import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import type { NumericInputProps } from "./NumericInput";
import NumericInput from "./NumericInput";

const NumericInputTest = ({ onChange, ...props }: NumericInputProps) => {
  const [value, setValue] = useState<number>();

  const handleChange = useCallback(
    (value?: number) => {
      setValue(value);
      onChange?.(value);
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

    expect(onChange).toHaveBeenLastCalledWith(123);
  });

  it("should clear number", async () => {
    const onChange = jest.fn();

    render(<NumericInputTest onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "123");
    await userEvent.clear(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
