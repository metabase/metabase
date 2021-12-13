import React, { ReactNode } from "react";
import { StepRoot, StepTitle, StepLabel } from "./SetupStep.styled";

interface Props {
  title: string;
  label: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const SetupStep = ({ title, label, children }: Props) => (
  <StepRoot>
    <StepTitle>{title}</StepTitle>
    <StepLabel>{label}</StepLabel>
    {children}
  </StepRoot>
);

export default SetupStep;
