import type { Ref } from "react";
import { forwardRef, useContext } from "react";

import { Box, Icon } from "metabase/ui";

import S from "./OnboardingStepper.module.css";
import { ItemContext, StepperContext } from "./OnboardingStepperContext";
import type { OnboardingStepperStepProps } from "./types";

export const OnboardingStepperStep = forwardRef(function OnboardingStepperStep(
  {
    stepId,
    title,
    icon,
    children,
    "data-testid": testId,
  }: OnboardingStepperStepProps,
  forwardedRef: Ref<HTMLDivElement>,
) {
  const {
    activeStep,
    completedSteps,
    lockedSteps,
    stepNumbers,
    stepRefs,
    setActiveStep,
  } = useContext(StepperContext);
  const ref = forwardedRef ?? stepRefs[stepId];
  const isActive = activeStep === stepId;
  const isCompleted = completedSteps[stepId] ?? false;
  const isLocked = lockedSteps[stepId] ?? false;
  const stepNumber = stepNumbers[stepId] ?? 0;

  return (
    <ItemContext.Provider value={{ stepId, icon }}>
      <Box
        component="section"
        ref={ref}
        className={S.StepRoot}
        role="listitem"
        aria-label={title}
        aria-current={isActive ? "step" : undefined}
        data-active={isActive}
        data-locked={isLocked}
        data-testid={testId}
        onClick={() => {
          if (isActive || isLocked) {
            return;
          }

          setActiveStep(stepId);
        }}
      >
        <div className={S.StepNumber} data-completed={isCompleted}>
          {isCompleted ? (
            <Icon name="check" className={S.StepNumberIcon} />
          ) : (
            <span className={S.StepNumberText}>{stepNumber}</span>
          )}
        </div>

        <div className={S.StepHeader}>
          <div className={S.StepTitle} data-completed={isCompleted}>
            {title}
          </div>

          {isLocked && (
            <Icon name="lock" className={S.StepLockIcon} aria-label="Locked" />
          )}
        </div>

        {isActive && <div className={S.StepContent}>{children}</div>}
      </Box>
    </ItemContext.Provider>
  );
});
