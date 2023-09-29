import { render, screen } from "@testing-library/react";
import _ from "underscore";

import { useCallbackEffect } from "./use-callback-effect";

interface Props {
  callback: () => void | Promise<void>;
}

const TestComponent = ({ callback }: Props) => {
  const [isScheduled, scheduleCallback] = useCallbackEffect();

  if (isScheduled) {
    return <div>Scheduled</div>;
  }

  return (
    <div>
      <button onClick={() => scheduleCallback(callback)}>Schedule</button>
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
});
