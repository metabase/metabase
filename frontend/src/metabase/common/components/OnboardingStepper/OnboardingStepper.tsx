import { Children, isValidElement, useEffect, useMemo, useState } from "react";

import { StepperContext } from "./OnboardingStepperContext";
import { OnboardingStepperStep } from "./OnboardingStepperStep";
import { useScrollStepIntoView } from "./hooks/use-scroll-step-into-view";
import type { OnboardingStepperProps } from "./types";

export type {
  OnboardingStepperProps,
  OnboardingStepperStepProps,
} from "./types";

/**
 * A stepper component for onboarding flows.
 *
 * Shows a vertical list of steps that can be expanded.
 *
 * Automatically advances to the next incomplete
 * step when a step is completed.
 */
const OnboardingStepperRoot = ({
  children,
  completedSteps,
  lockedSteps,
  onChange,
}: OnboardingStepperProps) => {
  // Extract step IDs and compute labels from children
  const { stepIds, stepNumbers } = useMemo(() => {
    const ids: string[] = [];
    const stepIdToNumber: Record<string, number> = {};

    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        if (child.type === OnboardingStepperStep && child.props.stepId) {
          const stepId = child.props.stepId;
          ids.push(stepId);
          stepIdToNumber[stepId] = ids.length;
        } else if (child.type !== OnboardingStepperStep) {
          console.warn(
            "OnboardingStepper: Only OnboardingStepper.Step components are allowed as children.",
          );
        }
      }
    });

    return { stepIds: ids, stepNumbers: stepIdToNumber };
  }, [children]);

  // First incomplete step will be active by default
  const defaultActiveStep = useMemo(() => {
    return stepIds.find((id) => !completedSteps[id]) ?? null;
  }, [stepIds, completedSteps]);

  const [activeStep, setActiveStepState] = useState<string | null>(
    defaultActiveStep,
  );

  const { stepRefs, scrollStepIntoView } = useScrollStepIntoView(stepIds);

  const setActiveStep = (stepId: string | null) => {
    setActiveStepState(stepId);
    scrollStepIntoView(stepId);
    onChange?.(stepId);
  };

  // Move on to next incomplete step when completedSteps changes
  useEffect(() => {
    const nextIncomplete = stepIds.find((id) => !completedSteps[id]) ?? null;

    setActiveStepState(nextIncomplete);
    scrollStepIntoView(nextIncomplete);
  }, [completedSteps, stepIds, scrollStepIntoView]);

  return (
    <StepperContext.Provider
      value={{
        activeStep,
        completedSteps,
        lockedSteps,
        stepNumbers,
        stepRefs,
        setActiveStep,
      }}
    >
      {children}
    </StepperContext.Provider>
  );
};

export const OnboardingStepper = Object.assign(OnboardingStepperRoot, {
  Step: OnboardingStepperStep,
});
