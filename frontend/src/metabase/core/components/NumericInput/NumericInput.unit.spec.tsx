import { useCallback, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumericInput, { NumericInputProps } from "./NumericInput";

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
  it("should set number", () => {
    const onChange = jest.fn();

    render(<NumericInputTest onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "123");

    expect(onChange).toHaveBeenLastCalledWith(123);
  });

  it("should clear number", () => {
    const onChange = jest.fn();

    render(<NumericInputTest onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "123");
    userEvent.clear(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
