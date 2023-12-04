import { useState } from "react";
import dayjs from "dayjs";
import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import { TimeInput } from "./TimeInput";

interface SetupOpts {
  defaultValue?: Date;
}

function setup({ defaultValue }: SetupOpts = {}) {
  const onChange = jest.fn();

  render(<TestInput defaultValue={defaultValue} onChange={onChange} />);

  return { onChange };
}

interface TestInputProps {
  defaultValue?: Date;
  onChange?: (date: Date) => void;
}

function TestInput({ defaultValue, onChange }: TestInputProps) {
  const [value, setValue] = useState(defaultValue);

  const handleChange = (value: Date) => {
    setValue(value);
    onChange?.(value);
  };

  return <TimeInput label="Time" value={value} onChange={handleChange} />;
}

describe("TimeInput", () => {
  it("should show the default value", () => {
    setup({ defaultValue: new Date(0, 0, 1, 12, 30) });

    const input = screen.getByLabelText("Time");
    expect(input).toHaveValue("12:30");
  });

  it("should allow to enter a time value", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Time");
    userEvent.type(input, "10:20");

    const time = onChange.mock.lastCall[0] as Date;
    expect(time.getHours()).toBe(10);
    expect(time.getMinutes()).toBe(20);
  });

  it("should reset to the last correct value on blur", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Time");
    userEvent.type(input, "10:20");
    userEvent.clear(input);
    userEvent.type(input, "12:");
    userEvent.tab();

    const time = onChange.mock.lastCall[0] as Date;
    expect(time.getHours()).toBe(10);
    expect(time.getMinutes()).toBe(20);
    expect(input).toHaveValue("10:20");
  });

  it("should handle an invalid value", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Time");
    userEvent.type(input, "32:71");

    expect(input).toHaveValue("03:59");
    expect(onChange).toHaveBeenCalledWith(dayjs("03:59", "HH:mm").toDate());
  });
});
