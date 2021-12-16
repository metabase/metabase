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
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onSelect: () => void;
}

const InactiveStep = ({
  title,
  label,
  isStepCompleted,
  isSetupCompleted,
  onSelect,
}: Props) => {
  return (
    <StepRoot
      isCompleted={isStepCompleted}
      onClick={isStepCompleted && !isSetupCompleted ? onSelect : undefined}
    >
      <StepTitle isCompleted={isStepCompleted}>{title}</StepTitle>
      <StepLabel isCompleted={isStepCompleted}>
        {isStepCompleted ? (
          <StepLabelIcon name="check" />
        ) : (
          <StepLabelText>{label}</StepLabelText>
        )}
      </StepLabel>
    </StepRoot>
  );
};

export default InactiveStep;
