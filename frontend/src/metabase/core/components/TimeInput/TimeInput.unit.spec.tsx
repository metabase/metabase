import React, { useState } from "react";
import { Duration } from "moment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput, { TimeInputProps } from "./TimeInput";

const TestTimeInput = (props: TimeInputProps) => {
  const [value, setValue] = useState<Duration>();
  return <TimeInput {...props} value={value} onChange={setValue} />;
};

describe("TimeInput", () => {
  it("should set hours and minutes", () => {
    render(<TestTimeInput />);

    userEvent.type(screen.getByLabelText("Hours"), "5");
    userEvent.type(screen.getByLabelText("Minutes"), "20");
    userEvent.tab();

    expect(screen.getByLabelText("Hours")).toHaveValue("05");
    expect(screen.getByLabelText("Minutes")).toHaveValue("20");
  });

  it("should remove time", () => {
    render(<TestTimeInput />);

    userEvent.type(screen.getByLabelText("Hours"), "5");
    userEvent.type(screen.getByLabelText("Minutes"), "20");
    userEvent.click(screen.getByLabelText("Remove time"));

    expect(screen.getByLabelText("Hours")).toHaveValue("");
    expect(screen.getByLabelText("Minutes")).toHaveValue("");
  });
});
