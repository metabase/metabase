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
  isFilled: boolean;
  isCompleted: boolean;
  onSelect: () => void;
}

const InactiveStep = ({
  title,
  label,
  isFilled,
  isCompleted,
  onSelect,
}: Props) => {
  return (
    <StepRoot
      isFilled={isFilled}
      onClick={isFilled && !isCompleted ? onSelect : undefined}
    >
      <StepTitle isFilled={isFilled}>{title}</StepTitle>
      <StepLabel isFilled={isFilled}>
        {isFilled ? (
          <StepLabelIcon name="check" />
        ) : (
          <StepLabelText>{label}</StepLabelText>
        )}
      </StepLabel>
    </StepRoot>
  );
};

export default InactiveStep;
