import cx from "classnames";
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

  if (isActive) {
    return (
      <ItemContext.Provider value={{ value, label, icon }}>
        <Box
          component="section"
          ref={ref as Ref<HTMLDivElement>}
          className={S.ActiveStepRoot}
          role="listitem"
          aria-label={title}
          aria-current="step"
          data-testid={testId}
        >
          <div className={S.ActiveStepLabel}>
            <span className={S.ActiveStepLabelText}>{label}</span>
          </div>
          <div className={S.ActiveStepTitle}>{title}</div>
          <div className={S.ActiveStepContent}>{children}</div>
        </Box>
      </ItemContext.Provider>
    );
  }

  return (
    <ItemContext.Provider value={{ value, label, icon }}>
      <Box
        component="section"
        ref={ref as Ref<HTMLDivElement>}
        className={S.InactiveStepRoot}
        role="listitem"
        aria-label={title}
        data-testid={testId}
        onClick={() => setActiveStep(value)}
      >
        <div
          className={cx(
            S.InactiveStepLabel,
            isCompleted && S.InactiveStepLabelCompleted,
          )}
        >
          {isCompleted ? (
            <Icon name="check" className={S.InactiveStepLabelIcon} />
          ) : (
            <span className={S.InactiveStepLabelText}>{label}</span>
          )}
        </div>
        <div
          className={cx(
            S.InactiveStepTitle,
            isCompleted && S.InactiveStepTitleCompleted,
          )}
        >
          {title}
        </div>
      </Box>
    </ItemContext.Provider>
  );
});
