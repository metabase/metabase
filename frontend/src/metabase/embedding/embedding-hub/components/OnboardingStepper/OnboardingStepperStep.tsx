import cx from "classnames";
import { useContext } from "react";

import { Box, Icon } from "metabase/ui";

import S from "./OnboardingStepper.module.css";
import { StepperContext } from "./OnboardingStepperContext";
import type { OnboardingStepperStepProps } from "./types";

export function OnboardingStepperStep({
  stepId,
  title,
  children,
  hideTitleOnActive = false,
  "data-testid": testId,
}: OnboardingStepperStepProps) {
  const {
    activeStep,
    completedSteps,
    lockedSteps,
    stepNumbers,
    stepRefs,
    setActiveStep,
  } = useContext(StepperContext);

  const ref = stepRefs[stepId];
  const isActive = activeStep === stepId;
  const isCompleted = completedSteps[stepId] ?? false;
  const isLocked = lockedSteps[stepId] ?? false;
  const stepNumber = stepNumbers[stepId] ?? 0;

  const shouldShowTitle = !isActive || !hideTitleOnActive;

  return (
    <Box
      component="section"
      ref={ref}
      className={S.StepRoot}
      role="listitem"
      aria-label={title}
      aria-current={isActive ? "step" : undefined}
      data-active={isActive}
      data-completed={isCompleted}
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

      <div
        className={cx(S.StepHeader, shouldShowTitle && S.StepHeaderWithTitle)}
      >
        {shouldShowTitle && (
          <div className={S.StepTitle} data-completed={isCompleted}>
            {title}
          </div>
        )}

        {isLocked && !isActive && (
          <Icon name="lock" className={S.StepLockIcon} aria-label="Locked" />
        )}
      </div>

      {isActive && (
        <div className={cx(shouldShowTitle && S.StepContentWithTitle)}>
          {children}
        </div>
      )}
    </Box>
  );
}
