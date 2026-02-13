import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { getIcon, render, screen } from "__support__/ui";

import { OnboardingStepper } from "./OnboardingStepper";
import type { OnboardingStepperHandle } from "./types";

const TestStepper = ({
  completedSteps = {},
  lockedSteps = {},
  onChange,
  stepperRef,
}: {
  completedSteps?: Record<string, boolean>;
  lockedSteps?: Record<string, boolean>;
  onChange?: (value: string | null) => void;
  stepperRef?: React.Ref<OnboardingStepperHandle>;
}) => (
  <OnboardingStepper
    ref={stepperRef}
    completedSteps={completedSteps}
    lockedSteps={lockedSteps}
    onChange={onChange}
  >
    <OnboardingStepper.Step stepId="step-1" title="First step">
      First step content
    </OnboardingStepper.Step>

    <OnboardingStepper.Step stepId="step-2" title="Second step">
      Second step content
    </OnboardingStepper.Step>

    <OnboardingStepper.Step stepId="step-3" title="Third step">
      Third step content
    </OnboardingStepper.Step>
  </OnboardingStepper>
);

const setup = (props: Parameters<typeof TestStepper>[0] = {}) => {
  const { rerender } = render(<TestStepper {...props} />);

  return {
    rerender: (newProps: Parameters<typeof TestStepper>[0]) =>
      rerender(<TestStepper {...props} {...newProps} />),
  };
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

  it("opens the last step when all steps are completed", () => {
    setup({
      completedSteps: { "step-1": true, "step-2": true, "step-3": true },
    });

    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
    expect(screen.getByText("Third step content")).toBeInTheDocument();
  });

  it("switches to clicked step", async () => {
    setup();

    // first step is active by default
    expect(screen.getByText("First step content")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Second step"));

    expect(screen.getByText("Second step content")).toBeInTheDocument();
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
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

  it("move on to next incomplete step when completedSteps changes", () => {
    const { rerender } = setup();

    // first step is active by default
    expect(screen.getByText("First step content")).toBeInTheDocument();

    // mark first step as complete
    rerender({ completedSteps: { "step-1": true } });

    // should move on to second step
    expect(screen.getByText("Second step content")).toBeInTheDocument();
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
  });

  it("calls onChange when step changes", async () => {
    const onChange = jest.fn();
    setup({ onChange });

    await userEvent.click(screen.getByText("Second step"));
    expect(onChange).toHaveBeenCalledWith("step-2");
  });

  it("shows lock icon for locked steps", () => {
    setup({ lockedSteps: { "step-2": true, "step-3": true } });

    expect(screen.getAllByRole("img", { name: /lock/i })).toHaveLength(2);
  });

  it("does not expand locked steps when clicked", async () => {
    setup({ lockedSteps: { "step-2": true } });

    // first step is active by default
    expect(screen.getByText("First step content")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Second step"));

    // second step is locked, so first step should still be active
    expect(screen.getByText("First step content")).toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
  });

  it("does not jump back to previous incomplete steps when completing a later step", async () => {
    const { rerender } = setup();

    // navigate to step 2 without completing step 1
    await userEvent.click(screen.getByText("Second step"));
    expect(screen.getByText("Second step content")).toBeInTheDocument();

    // complete step 2 (step 1 is still incomplete)
    rerender({ completedSteps: { "step-2": true } });

    // should move forward to step 3, not back to step 1
    expect(screen.getByText("Third step content")).toBeInTheDocument();
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
  });

  it("does not auto-advance to a locked step when current step is completed", () => {
    const { rerender } = setup({ lockedSteps: { "step-2": true } });

    // first step is active by default
    expect(screen.getByText("First step content")).toBeInTheDocument();

    // complete step 1, but step 2 is locked
    rerender({
      completedSteps: { "step-1": true },
      lockedSteps: { "step-2": true },
    });

    // should collapse step 1 but NOT open locked step 2
    // instead it should skip to step 3 (first incomplete unlocked step)
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
    expect(screen.getByText("Third step content")).toBeInTheDocument();
  });

  it("should not jump backward to an incomplete step when calling goToNextIncompleteStep", async () => {
    const ref = createRef<OnboardingStepperHandle>();

    setup({ completedSteps: { "step-1": true }, stepperRef: ref });

    // step 2 is the first incomplete unlocked step, so it should be active
    expect(screen.getByText("Second step content")).toBeInTheDocument();

    // go to step 3
    await userEvent.click(screen.getByText("Third step"));
    expect(screen.getByText("Third step content")).toBeInTheDocument();

    // simulate "Next" button
    act(() => {
      ref.current?.goToNextIncompleteStep();
    });

    // should collapse all since there's nothing forward
    expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
    expect(screen.queryByText("Third step content")).not.toBeInTheDocument();
  });
});
