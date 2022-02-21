import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumericInput, { NumericInputProps } from "./NumericInput";

const NumericInputTest = (props: NumericInputProps) => {
  const [value, setValue] = useState<number>();
  return <NumericInput {...props} value={value} onChange={setValue} />;
};

describe("NumericInput", () => {
  it("should accept test input", () => {
    render(<NumericInputTest />);

    userEvent.type(screen.getByRole("textbox"), "123");
    expect(screen.getByDisplayValue("123")).toBeInTheDocument();

    userEvent.tab();
    expect(screen.getByDisplayValue("123")).toBeInTheDocument();
  });

  it("should reject invalid input", () => {
    render(<NumericInputTest />);

    userEvent.type(screen.getByRole("textbox"), "abc");
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();

    userEvent.tab();
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
  });
});
