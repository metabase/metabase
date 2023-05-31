import React, { ReactNode } from "react";
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
    <StepRoot>
      <StepTitle>{title}</StepTitle>
      <StepLabel>
        <StepLabelText>{label}</StepLabelText>
      </StepLabel>
      {children}
    </StepRoot>
  );
};
