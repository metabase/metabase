import userEvent from "@testing-library/user-event";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useState } from "react";

import { render, screen } from "__support__/ui";

import type { TimeInputProps } from "./TimeInput";
import TimeInput from "./TimeInput";

const TestTimeInput = ({ onChange, ...props }: TimeInputProps) => {
  const [value, setValue] = useState(props.value);

  const handleChange = useCallback(
    (value: Dayjs) => {
      setValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return <TimeInput {...props} value={value} onChange={handleChange} />;
};

describe("TimeInput", () => {
  it("should set time in 12-hour clock", async () => {
    const value = dayjs().hour(0).minute(0);
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);
    await userEvent.clear(screen.getByLabelText("Hours"));
    await userEvent.type(screen.getByLabelText("Hours"), "5");
    await userEvent.clear(screen.getByLabelText("Minutes"));
    await userEvent.type(screen.getByLabelText("Minutes"), "20");

    const expected = value.clone();
    expected.hour(5);
    expected.minute(20);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should set time in 24-hour clock", async () => {
    const value = dayjs().hour(0).minute(0);
    const onChange = jest.fn();

    render(
      <TestTimeInput value={value} timeFormat="HH:mm" onChange={onChange} />,
    );
    await userEvent.clear(screen.getByLabelText("Hours"));
    await userEvent.type(screen.getByLabelText("Hours"), "15");
    await userEvent.clear(screen.getByLabelText("Minutes"));
    await userEvent.type(screen.getByLabelText("Minutes"), "10");

    const expected = value.clone();
    expected.hour(15);
    expected.minute(10);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should change meridiem to am", async () => {
    const value = dayjs().hour(12).minute(20);
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);
    await userEvent.click(screen.getByText("AM"));

    const expected = value.clone();
    expected.hour(0);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("should change meridiem to pm", async () => {
    const value = dayjs().hour(10).minute(20);
    const onChange = jest.fn();

    render(<TestTimeInput value={value} onChange={onChange} />);
    await userEvent.click(screen.getByText("PM"));

    const expected = value.clone();
    expected.hour(22);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("should clear time", async () => {
    const value = dayjs().hour(2).minute(10);
    const onClear = jest.fn();

    render(<TestTimeInput value={value} onClear={onClear} />);
    await userEvent.clear(screen.getByLabelText("Hours"));
    await userEvent.type(screen.getByLabelText("Hours"), "5");
    await userEvent.clear(screen.getByLabelText("Minutes"));
    await userEvent.type(screen.getByLabelText("Minutes"), "20");
    await userEvent.click(screen.getByLabelText("Remove time"));

    const expected = value.clone();
    expected.hour(0);
    expected.minute(0);
    expect(onClear).toHaveBeenCalledWith(expected);
  });
});
