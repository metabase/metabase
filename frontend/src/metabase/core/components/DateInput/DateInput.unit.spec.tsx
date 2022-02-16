import React from "react";
import moment from "moment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateInput from "./DateInput";

describe("DateInput", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2015, 0, 1));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should set a label", () => {
    render(<DateInput aria-label="Date" />);

    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("should accept text input", () => {
    const onChange = jest.fn();

    render(<DateInput onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "10/20/2021");

    const expectedDate = moment("10/20/2021", "MM/DD/YYYY");
    expect(onChange).toHaveBeenLastCalledWith(expectedDate);
  });
});
