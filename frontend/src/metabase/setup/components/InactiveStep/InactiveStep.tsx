import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelIcon,
  StepLabelText,
} from "./InactiveStep.styled";

interface InactiveStepProps {
  title: string;
  label: number;
  isStepCompleted: boolean;
}

export const InactiveStep = ({
  title,
  label,
  isStepCompleted,
}: InactiveStepProps): JSX.Element => {
  return (
    <StepRoot
      role="listitem"
      isCompleted={isStepCompleted}
      aria-label={title}
      data-testid="setup-step"
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
