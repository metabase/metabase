import type { ReactNode } from "react";

import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelText,
} from "./ActiveStep.styled";

interface ActiveStepProps {
  title: string;
  label: number;
  children?: ReactNode;
}

export const ActiveStep = ({
  title,
  label,
  children,
}: ActiveStepProps): JSX.Element => {
  return (
    <StepRoot
      role="listitem"
      aria-label={title}
      aria-current="step"
      data-testid="setup-step"
    >
      <StepTitle>{title}</StepTitle>
      <StepLabel>
        <StepLabelText>{label}</StepLabelText>
      </StepLabel>
      {children}
    </StepRoot>
  );
};
