import type { ReactNode } from "react";

import { useSelector } from "metabase/lib/redux";
import { getShouldShowStepNumber } from "metabase/setup";

import {
  StepLabel,
  StepLabelText,
  StepRoot,
  StepTitle,
} from "./ActiveStep.styled";

interface ActiveStepProps {
  title: string;
  label: number;
  children?: ReactNode;
  className?: string;
}

export const ActiveStep = ({
  title,
  label,
  children,
  className,
}: ActiveStepProps): JSX.Element => {
  const shouldShowStepNumber = useSelector(getShouldShowStepNumber);

  return (
    <StepRoot
      role="listitem"
      aria-label={title}
      aria-current="step"
      data-testid="setup-step"
      className={className}
    >
      <StepTitle>{title}</StepTitle>

      {shouldShowStepNumber && (
        <StepLabel data-testid="step-number">
          <StepLabelText>{label}</StepLabelText>
        </StepLabel>
      )}

      {children}
    </StepRoot>
  );
};
