import React from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelIcon,
  StepLabelText,
} from "./InactiveStep.styled";

interface Props {
  title: string;
  label: number;
  isCompleted?: boolean;
}

const InactiveStep = ({ title, label, isCompleted }: Props) => {
  return (
    <StepRoot isCompleted={isCompleted}>
      <StepTitle isCompleted={isCompleted}>{title}</StepTitle>
      <StepLabel isCompleted={isCompleted}>
        {isCompleted ? (
          <StepLabelIcon name="check" />
        ) : (
          <StepLabelText>{label}</StepLabelText>
        )}
      </StepLabel>
    </StepRoot>
  );
};

export default InactiveStep;
