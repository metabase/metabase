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
  isSetupCompleted: boolean;
  onStepSelect: () => void;
}

export const InactiveStep = ({
  title,
  label,
  isStepCompleted,
  isSetupCompleted,
  onStepSelect,
}: InactiveStepProps): JSX.Element => {
  return (
    <StepRoot
      role="listitem"
      isCompleted={isStepCompleted}
      onClick={isStepCompleted && !isSetupCompleted ? onStepSelect : undefined}
      aria-label={title}
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
