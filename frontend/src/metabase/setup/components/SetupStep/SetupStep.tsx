import React, { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepDescription,
} from "./SetupStep.styled";

interface Props {
  title: string;
  label: string;
  description?: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const SetupStep = ({ title, label, description, children }: Props) => (
  <StepRoot>
    <StepTitle>{title}</StepTitle>
    <StepLabel>{label}</StepLabel>
    {description && <StepDescription>{description}</StepDescription>}
    {children}
  </StepRoot>
);

export default SetupStep;
