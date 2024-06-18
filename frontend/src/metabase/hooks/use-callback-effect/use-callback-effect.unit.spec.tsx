import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  it("is not scheduled initially", () => {
    const callback = jest.fn();

    render(<TestComponent callback={callback} />);

    expect(screen.getByText("Status: not scheduled")).toBeInTheDocument();
  });

  it("schedules callback to after re-render", async () => {
    const callback = jest.fn();

    render(<TestComponent callback={callback} />);

    userEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(callback).not.toHaveBeenCalled();
    await screen.findByText("Status: scheduled");

    await waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Status: not scheduled")).toBeInTheDocument();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
