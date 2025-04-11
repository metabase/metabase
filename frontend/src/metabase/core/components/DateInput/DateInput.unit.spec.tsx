import userEvent from "@testing-library/user-event";
import type { Dayjs } from "dayjs";
import { useCallback, useState } from "react";

import { render, screen } from "__support__/ui";

import type { DateInputProps } from "./DateInput";
import DateInput from "./DateInput";

const DateInputTest = ({ onChange, ...props }: DateInputProps) => {
  const [value, setValue] = useState<Dayjs>();

  const handleChange = useCallback(
    (value?: Dayjs) => {
      setValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return <DateInput {...props} value={value} onChange={handleChange} />;
};

describe("DateInput", () => {
  it("should set date", async () => {
    const onChange = jest.fn();

    render(<DateInputTest onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "10/20/21");

    expect(onChange).toHaveBeenCalled();
  });

  it("should set date with time with 12-hour clock", async () => {
    const onChange = jest.fn();

    render(<DateInputTest hasTime onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "10/20/21 9:15 PM");

    expect(onChange).toHaveBeenCalled();
  });

  it("should set date with time with 24-hour clock", async () => {
    const onChange = jest.fn();

    render(<DateInputTest hasTime onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "10/20/21 9:15");

    expect(onChange).toHaveBeenCalled();
  });

  it("should clear date", async () => {
    const onChange = jest.fn();

    render(<DateInputTest onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "10/20/21");
    await userEvent.clear(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
