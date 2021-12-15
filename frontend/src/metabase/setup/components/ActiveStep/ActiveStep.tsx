import React, { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelText,
} from "./ActiveStep.styled";

interface Props {
  title: string;
  label: number;
  children?: ReactNode;
}

const ActiveStep = ({ title, label, children }: Props) => {
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

export default ActiveStep;
