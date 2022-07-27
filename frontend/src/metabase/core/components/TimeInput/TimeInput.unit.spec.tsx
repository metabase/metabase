import React, { useCallback, useState } from "react";
import moment, { Moment } from "moment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput, { TimeInputProps } from "./TimeInput";

const user = userEvent.setup();

const TestTimeInput = ({ onChange, ...props }: TimeInputProps) => {
  const [value, setValue] = useState(props.value);

  const handleChange = useCallback(
    (value: Moment) => {
      setValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return <TimeInput {...props} value={value} onChange={handleChange} />;
};

describe("TimeInput", () => {
  it("should set time in 12-hour clock", async () => {
    const value = moment({ hours: 0, minutes: 0 });
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);

    await user.clear(screen.getByLabelText("Hours"));
    await user.type(screen.getByLabelText("Hours"), "5");
    await user.clear(screen.getByLabelText("Minutes"));
    await user.type(screen.getByLabelText("Minutes"), "20");

    const expected = value.clone();
    expected.hours(5);
    expected.minutes(20);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should set time in 24-hour clock", async () => {
    const value = moment({ hours: 0, minutes: 0 });
    const onChange = jest.fn();

    render(<TestTimeInput value={value} is24HourMode onChange={onChange} />);
    await user.clear(screen.getByLabelText("Hours"));
    await user.type(screen.getByLabelText("Hours"), "15");
    await user.clear(screen.getByLabelText("Minutes"));
    await user.type(screen.getByLabelText("Minutes"), "10");

    const expected = value.clone();
    expected.hours(15);
    expected.minutes(10);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should change meridiem to am", async () => {
    const value = moment({ hours: 12, minutes: 20 });
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);
    await user.click(screen.getByText("AM"));

    const expected = value.clone();
    expected.hours(0);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("should change meridiem to pm", async () => {
    const value = moment({ hours: 10, minutes: 20 });
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);
    await user.click(screen.getByText("PM"));

    const expected = value.clone();
    expected.hours(22);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("should clear time", async () => {
    const value = moment({ hours: 2, minutes: 10 });
    const onClear = jest.fn();

    render(<TestTimeInput value={value} onClear={onClear} />);
    await user.clear(screen.getByLabelText("Hours"));
    await user.type(screen.getByLabelText("Hours"), "5");
    await user.clear(screen.getByLabelText("Minutes"));
    await user.type(screen.getByLabelText("Minutes"), "20");
    await user.click(screen.getByLabelText("Remove time"));

    const expected = value.clone();
    expected.hours(0);
    expected.minutes(0);
    expect(onClear).toHaveBeenCalledWith(expected);
  });
});
