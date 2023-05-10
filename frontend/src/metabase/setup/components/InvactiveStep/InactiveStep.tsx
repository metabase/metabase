import React from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelIcon,
  StepLabelText,
} from "./InactiveStep.styled";

export interface InactiveStepProps {
  title: string;
  label: number;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onStepSelect: () => void;
}

const InactiveStep = ({
  title,
  label,
  isStepCompleted,
  isSetupCompleted,
  onStepSelect,
}: InactiveStepProps): JSX.Element => {
  return (
    <StepRoot
      isCompleted={isStepCompleted}
      onClick={isStepCompleted && !isSetupCompleted ? onStepSelect : undefined}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default InactiveStep;
