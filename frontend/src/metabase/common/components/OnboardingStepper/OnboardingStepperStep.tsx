import type { Ref } from "react";
import { forwardRef, useContext } from "react";

import { Box, Icon } from "metabase/ui";

import S from "./OnboardingStepper.module.css";
import { ItemContext, StepperContext } from "./OnboardingStepperContext";
import type { OnboardingStepperStepProps } from "./types";

export const OnboardingStepperStep = forwardRef(function OnboardingStepperStep(
  {
    value,
    label,
    title,
    icon,
    children,
    "data-testid": testId,
  }: OnboardingStepperStepProps,
  forwardedRef: Ref<HTMLDivElement>,
) {
  const { activeStep, completedSteps, stepRefs, setActiveStep } =
    useContext(StepperContext);
  const ref = forwardedRef ?? stepRefs[value];
  const isActive = activeStep === value;
  const isCompleted = completedSteps[value] ?? false;

  return (
    <ItemContext.Provider value={{ value, label, icon }}>
      <Box
        component="section"
        ref={ref}
        className={S.StepRoot}
        role="listitem"
        aria-label={title}
        aria-current={isActive ? "step" : undefined}
        data-active={isActive}
        data-testid={testId}
        onClick={isActive ? undefined : () => setActiveStep(value)}
      >
        <div className={S.StepNumber} data-completed={isCompleted}>
          {isCompleted ? (
            <Icon name="check" className={S.StepNumberIcon} />
          ) : (
            <span className={S.StepNumberText}>{label}</span>
          )}
        </div>

        <div className={S.StepTitle} data-completed={isCompleted}>
          {title}
        </div>

        {isActive && <div className={S.StepContent}>{children}</div>}
      </Box>
    </ItemContext.Provider>
  );
});
