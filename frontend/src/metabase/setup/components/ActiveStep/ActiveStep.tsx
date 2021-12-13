import React, { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepDescription,
} from "./ActiveStep.styled";

interface Props {
  title: string;
  label: string;
  description?: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const ActiveStep = ({ title, label, description, children }: Props) => (
  <StepRoot>
    <StepTitle>{title}</StepTitle>
    <StepLabel>{label}</StepLabel>
    {description && <StepDescription>{description}</StepDescription>}
    {children}
  </StepRoot>
);

export default ActiveStep;
