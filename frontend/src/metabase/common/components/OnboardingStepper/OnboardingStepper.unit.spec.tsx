import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { act, getIcon, render, screen } from "__support__/ui";

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

  it("does not collapse a manually opened step when all steps are already completed", async () => {
    const { rerender } = setup({
      completedSteps: { "step-1": true, "step-2": true, "step-3": true },
    });

    // all steps are already completed, last step is initially active
    expect(screen.getByText("Third step content")).toBeInTheDocument();

    // user manually opens step 2
    await userEvent.click(screen.getByText("Second step"));
    expect(screen.getByText("Second step content")).toBeInTheDocument();

    // completedSteps changes but all steps remain complete
    // (simulates a re-render with new object reference)
    rerender({
      completedSteps: { "step-1": true, "step-2": true, "step-3": true },
    });

    // step 2 should stay open, not collapse
    expect(screen.getByText("Second step content")).toBeInTheDocument();
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

  // goToNextIncompleteStep is a ref method for manual navigation,
  // e.g. when a user clicks a "Next" button manually within a step.
  // It differs from auto-advance which triggers automatically when completedSteps changes.
  describe("goToNextIncompleteStep (manual navigation via refs)", () => {
    const setupWithRef = (props: Parameters<typeof TestStepper>[0] = {}) => {
      const ref = createRef<OnboardingStepperHandle>();
      render(<TestStepper {...props} stepperRef={ref} />);

      return { ref };
    };

    it("navigates to next step in sequence when called via ref", () => {
      const { ref } = setupWithRef();

      expect(screen.getByText("First step content")).toBeInTheDocument();

      // simulates clicking the "Next" button manually within a step.
      act(() => ref.current?.goToNextIncompleteStep());

      expect(screen.getByText("Second step content")).toBeInTheDocument();
      expect(screen.queryByText("First step content")).not.toBeInTheDocument();
    });

    it("skips completed steps to find next incomplete", async () => {
      const { ref } = setupWithRef({ completedSteps: { "step-2": true } });

      expect(screen.getByText("First step content")).toBeInTheDocument();

      // step 2 is complete, so should skip to step 3
      act(() => ref.current?.goToNextIncompleteStep());

      expect(screen.getByText("Third step content")).toBeInTheDocument();
      expect(screen.queryByText("Second step content")).not.toBeInTheDocument();
    });

    it("navigates to last step when all remaining steps are complete", async () => {
      const { ref } = setupWithRef({
        completedSteps: { "step-1": true, "step-2": true, "step-3": true },
      });

      // all steps complete, last step is initially active
      expect(screen.getByText("Third step content")).toBeInTheDocument();

      // manually open step 2
      await userEvent.click(screen.getByText("Second step"));
      expect(screen.getByText("Second step content")).toBeInTheDocument();

      // all steps complete, so navigate to last step (summary)
      act(() => ref.current?.goToNextIncompleteStep());

      expect(screen.getByText("Third step content")).toBeInTheDocument();
    });
  });
});
