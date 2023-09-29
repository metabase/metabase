import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { useCallbackEffect } from "./use-callback-effect";

interface Props {
  callback: () => void | Promise<void>;
}

const TestComponent = ({ callback }: Props) => {
  const [isScheduled, scheduleCallback] = useCallbackEffect();

  const handleScheduleClick = () => {
    scheduleCallback(callback);
  };

  return (
    <div>
      <button onClick={handleScheduleClick}>Schedule</button>
      <div>Status: {isScheduled ? "scheduled" : "not scheduled"}</div>
    </div>
  );
};

describe("useCallbackEffect", () => {
  it("should not be scheduled initially", () => {
    const callback = jest.fn(_.noop);

    render(<TestComponent callback={callback} />);

    expect(screen.getByText("Status: not scheduled")).toBeInTheDocument();
  });

  it("should be scheduled after calling scheduleCallback", () => {
    const callback = jest.fn(_.noop);

    render(<TestComponent callback={callback} />);

    userEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(screen.getByText("Status: scheduled")).toBeInTheDocument();
  });
});
