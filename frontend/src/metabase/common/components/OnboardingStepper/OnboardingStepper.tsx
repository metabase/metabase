import { Children, isValidElement, useEffect, useMemo, useState } from "react";

import { StepperContext } from "./OnboardingStepperContext";
import { OnboardingStepperStep } from "./OnboardingStepperStep";
import { useScrollStepIntoView } from "./hooks/use-scroll-step-into-view";
import type { OnboardingStepperProps } from "./types";

export type {
  OnboardingStepperProps,
  OnboardingStepperStepProps,
} from "./types";

const OnboardingStepperRoot = ({
  children,
  completedSteps = {},
  lockedSteps = {},
  onChange,
}: OnboardingStepperProps) => {
  // Extract step IDs and compute labels from children
  const { stepIds, stepNumbers } = useMemo(() => {
    const ids: string[] = [];
    const stepNumbers: Record<string, number> = {};

    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.stepId) {
        const stepId = child.props.stepId;
        ids.push(stepId);
        stepNumbers[stepId] = ids.length;
      }
    });

    return { stepIds: ids, stepNumbers };
  }, [children]);

  // Calculate default active step: first incomplete step, or null if all complete
  const defaultActiveStep = useMemo(() => {
    return stepIds.find((id) => !completedSteps[id]) ?? null;
  }, [stepIds, completedSteps]);

  const [activeStep, setActiveStepState] = useState<string | null>(
    defaultActiveStep,
  );

  const { stepRefs, handleStepChange } = useScrollStepIntoView(
    stepIds,
    onChange,
  );

  const setActiveStep = (stepId: string | null) => {
    setActiveStepState(stepId);
    handleStepChange(stepId);
  };

  // Move on to next incomplete step when completedSteps changes
  useEffect(() => {
    const nextIncomplete = stepIds.find((id) => !completedSteps[id]) ?? null;

    setActiveStepState(nextIncomplete);
  }, [completedSteps, stepIds]);

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
