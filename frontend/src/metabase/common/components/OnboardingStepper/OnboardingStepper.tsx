import { Children, isValidElement, useMemo, useState } from "react";

import { Box } from "metabase/ui";

import S from "./OnboardingStepper.module.css";
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
  onChange,
}: OnboardingStepperProps) => {
  // Extract step IDs from children
  const stepIds = useMemo(() => {
    const ids: string[] = [];

    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.value) {
        ids.push(child.props.value);
      }
    });

    return ids;
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

  const setActiveStep = (value: string | null) => {
    setActiveStepState(value);
    handleStepChange(value);
  };

  return (
    <StepperContext.Provider
      value={{ activeStep, completedSteps, stepRefs, setActiveStep }}
    >
      <Box className={S.StepperRoot} role="list">
        {children}
      </Box>
    </StepperContext.Provider>
  );
};

export const OnboardingStepper = Object.assign(OnboardingStepperRoot, {
  Step: OnboardingStepperStep,
});
