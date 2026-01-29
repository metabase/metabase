import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";

import { OnboardingStepper } from "./OnboardingStepper";

const setup = ({
  completedSteps = {},
  onChange,
}: {
  completedSteps?: Record<string, boolean>;
  onChange?: (value: string | null) => void;
} = {}) => {
  render(
    <OnboardingStepper completedSteps={completedSteps} onChange={onChange}>
      <OnboardingStepper.Step value="step-1" label={1} title="First step">
        First step content
      </OnboardingStepper.Step>
      <OnboardingStepper.Step value="step-2" label={2} title="Second step">
        Second step content
      </OnboardingStepper.Step>
      <OnboardingStepper.Step value="step-3" label={3} title="Third step">
        Third step content
      </OnboardingStepper.Step>
    </OnboardingStepper>,
  );
};

describe("OnboardingStepper", () => {
  it("shows all step titles by default", () => {
    setup();

    expect(screen.getByText("First step")).toBeInTheDocument();
    expect(screen.getByText("Second step")).toBeInTheDocument();
    expect(screen.getByText("Third step")).toBeInTheDocument();
  });

  it("opens the first incomplete step by default", () => {
    setup({ completedSteps: { "step-1": true } });

    // first step is completed, so second step should be active
    expect(screen.getByText("Second step content")).toBeInTheDocument();
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
  });

  it("does not open any step when all steps are completed", () => {
    setup({
      completedSteps: { "step-1": true, "step-2": true, "step-3": true },
    });

    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Third step content")).not.toBeInTheDocument();
  });

  it("switches to clicked step", async () => {
    setup();

    // first step is active by default
    expect(screen.getByText("First step content")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Second step"));

    expect(screen.getByText("Second step content")).toBeInTheDocument();
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
  });

  it("calls onChange when step changes", async () => {
    const onChange = jest.fn();
    setup({ onChange });

    await userEvent.click(screen.getByText("Second step"));

    expect(onChange).toHaveBeenCalledWith("step-2");
  });

  it("shows checkmark icon for completed steps", () => {
    setup({ completedSteps: { "step-1": true, "step-2": true } });

    // should have two check icons for completed steps
    const checkIcons = screen.getAllByRole("img", { name: /check/i });
    expect(checkIcons).toHaveLength(2);
  });

  it("retains completed styling when selecting a completed step", async () => {
    setup({ completedSteps: { "step-1": true } });

    await userEvent.click(screen.getByText("First step"));

    // should show content and still have check icon
    expect(screen.getByText("First step content")).toBeInTheDocument();
    expect(getIcon("check")).toBeInTheDocument();
  });
});
