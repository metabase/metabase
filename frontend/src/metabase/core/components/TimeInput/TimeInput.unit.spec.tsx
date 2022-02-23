import React, { useCallback, useState } from "react";
import { duration, Duration } from "moment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput, { TimeInputProps } from "./TimeInput";

const TestTimeInput = ({ onChange, ...props }: TimeInputProps) => {
  const [value, setValue] = useState<Duration>();

  const handleChange = useCallback(
    (value?: Duration) => {
      setValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return <TimeInput {...props} value={value} onChange={handleChange} />;
};

describe("TimeInput", () => {
  it("should set time", () => {
    const onChange = jest.fn();

    render(<TestTimeInput onChange={onChange} />);
    userEvent.type(screen.getByLabelText("Hours"), "5");
    userEvent.type(screen.getByLabelText("Minutes"), "20");

    const expected = duration({ hours: 5, minutes: 20 });
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should clear time", () => {
    const onChange = jest.fn();

    render(<TestTimeInput onChange={onChange} />);
    userEvent.type(screen.getByLabelText("Hours"), "5");
    userEvent.type(screen.getByLabelText("Minutes"), "20");
    userEvent.click(screen.getByLabelText("Remove time"));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
