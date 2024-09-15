import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useActionButtonLabel } from "./use-action-button-label";

const TestComponent = () => {
  const { label, setLabel } = useActionButtonLabel({
    defaultLabel: "default",
    timeout: 1000,
  });

  return (
    <div>
      <button onClick={() => setLabel("success")}>Success</button>
      <button onClick={() => setLabel("failed")}>Fail</button>
      <div>Current label: {label}</div>
    </div>
  );
};

jest.useFakeTimers({
  advanceTimers: true,
});

describe("useActionButtonLabel", () => {
  it("should show the default label when rendered", async () => {
    render(<TestComponent />);
    expect(screen.getByText("Current label: default")).toBeInTheDocument();
  });

  it("should update value, and return to default after the timeout", async () => {
    render(<TestComponent />);
    expect(screen.getByText("Current label: default")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Success"));

    expect(screen.getByText("Current label: success")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));

    expect(screen.getByText("Current label: default")).toBeInTheDocument();
  });

  it("should should update value, and return to default after the timeout", async () => {
    render(<TestComponent />);
    expect(screen.getByText("Current label: default")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Success"));

    expect(screen.getByText("Current label: success")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(500));

    expect(screen.getByText("Current label: success")).toBeInTheDocument();

    //Update the label half way through the timeout
    await userEvent.click(screen.getByText("Fail"));
    expect(screen.getByText("Current label: failed")).toBeInTheDocument();

    //Previous timeout should have been cleared, should still say failed
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByText("Current label: failed")).toBeInTheDocument();

    //Second update timeout completes, should go back to default text
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByText("Current label: default")).toBeInTheDocument();
  });
});
