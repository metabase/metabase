import React, { ReactNode } from "react";
import { StepRoot, StepTitle } from "./SetupStep.styled";

interface Props {
  title: string;
  label: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const SetupStep = ({ title, children }: Props) => (
  <StepRoot>
    <StepTitle>{title}</StepTitle>
    {children}
  </StepRoot>
);

export default SetupStep;
