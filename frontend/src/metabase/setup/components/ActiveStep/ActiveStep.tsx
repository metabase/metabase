import React, { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepDescription,
  StepLabelText,
} from "./ActiveStep.styled";

interface Props {
  title: string;
  label: number;
  description?: string;
  children?: ReactNode;
}

const ActiveStep = ({ title, label, description, children }: Props) => {
  return (
    <StepRoot>
      <StepTitle>{title}</StepTitle>
      <StepLabel>
        <StepLabelText>{label}</StepLabelText>
      </StepLabel>
      {description && <StepDescription>{description}</StepDescription>}
      {children}
    </StepRoot>
  );
};

export default ActiveStep;
