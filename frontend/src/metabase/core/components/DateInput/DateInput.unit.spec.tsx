import { useCallback, useState } from "react";
import moment, { Moment } from "moment-timezone";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateInput, { DateInputProps } from "./DateInput";

const DateInputTest = ({ onChange, ...props }: DateInputProps) => {
  const [value, setValue] = useState<Moment>();

  const handleChange = useCallback(
    (value?: Moment) => {
      setValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return <DateInput {...props} value={value} onChange={handleChange} />;
};

describe("DateInput", () => {
  it("should set date", () => {
    const onChange = jest.fn();

    render(<DateInputTest onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "10/20/21");

    const expected = moment("10/20/21", ["MM/DD/YYYY"]);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should set date with time with 12-hour clock", () => {
    const onChange = jest.fn();

    render(<DateInputTest hasTime onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "10/20/21 9:15 PM");

    const expected = moment("10/20/21 9:15 PM", ["MM/DD/YYYY, h:mm A"]);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should set date with time with 24-hour clock", () => {
    const onChange = jest.fn();

    render(<DateInputTest hasTime onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "10/20/21 9:15");

    const expected = moment("10/20/21 9:15", ["MM/DD/YYYY, HH:mm"]);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should clear date", () => {
    const onChange = jest.fn();

    render(<DateInputTest onChange={onChange} />);
    userEvent.type(screen.getByRole("textbox"), "10/20/21");
    userEvent.clear(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
