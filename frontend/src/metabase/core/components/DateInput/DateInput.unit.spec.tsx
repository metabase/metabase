import React, { useState } from "react";
import { Moment } from "moment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateInput, { DateInputProps } from "./DateInput";

const DateInputTest = (props: DateInputProps) => {
  const [value, setValue] = useState<Moment>();
  return <DateInput {...props} value={value} onChange={setValue} />;
};

describe("DateInput", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2015, 0, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should accept text input", () => {
    render(<DateInputTest />);

    userEvent.type(screen.getByRole("textbox"), "10/20/21");
    expect(screen.getByDisplayValue("10/20/21")).toBeInTheDocument();

    userEvent.tab();
    expect(screen.getByDisplayValue("10/20/2021")).toBeInTheDocument();
  });

  it("should reject invalid input", () => {
    render(<DateInputTest />);

    userEvent.type(screen.getByRole("textbox"), "abc");
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();

    userEvent.tab();
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
  });

  it("should set a placeholder", () => {
    render(<DateInputTest />);

    expect(screen.getByPlaceholderText("01/10/2015")).toBeInTheDocument();
  });

  it("should set a label", () => {
    render(<DateInputTest aria-label="Date" />);

    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });
});
