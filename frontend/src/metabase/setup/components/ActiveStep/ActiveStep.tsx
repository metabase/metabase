import React, { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepDescription,
  StepLabelText,
} from "./ActiveStep.styled";

interface Props {
  step: number;
  title: string;
  description?: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const ActiveStep = ({ step, title, description, children }: Props) => {
  return (
    <StepRoot>
      <StepTitle>{title}</StepTitle>
      <StepLabel>
        <StepLabelText>{step}</StepLabelText>
      </StepLabel>
      {description && <StepDescription>{description}</StepDescription>}
      {children}
    </StepRoot>
  );
};

export default ActiveStep;
