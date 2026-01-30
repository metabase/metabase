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
    const stepIdToNumber: Record<string, number> = {};

    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.stepId) {
        const stepId = child.props.stepId;
        ids.push(stepId);
        stepIdToNumber[stepId] = ids.length;
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

  // Scroll to the active step when the active step changes
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
