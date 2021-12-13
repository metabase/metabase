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
  onSelect?: () => void;
}

const InactiveStep = ({ title, label, isCompleted, onSelect }: Props) => {
  return (
    <StepRoot
      isCompleted={isCompleted}
      onClick={isCompleted ? onSelect : undefined}
    >
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
