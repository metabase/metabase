import React from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelIcon,
  StepLabelText,
} from "./InactiveStep.styled";

interface Props {
  step: number;
  title: string;
  isCompleted?: boolean;
}

const InactiveStep = ({ step, title, isCompleted }: Props) => {
  return (
    <StepRoot isCompleted={isCompleted}>
      <StepTitle isCompleted={isCompleted}>{title}</StepTitle>
      <StepLabel isCompleted={isCompleted}>
        {isCompleted ? (
          <StepLabelIcon name="check" />
        ) : (
          <StepLabelText>{step}</StepLabelText>
        )}
      </StepLabel>
    </StepRoot>
  );
};

export default InactiveStep;
