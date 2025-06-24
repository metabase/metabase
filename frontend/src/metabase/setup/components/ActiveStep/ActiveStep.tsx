import {
  StepLabel,
  StepLabelText,
  StepRoot,
  StepTitle,
} from "./ActiveStep.styled";

interface ActiveStepProps {
  title: string;
  label: number;
  children?: React.ReactNode;
}

export const ActiveStep = ({
  title,
  label,
  children,
}: ActiveStepProps): JSX.Element => {
  return (
    <StepRoot
      role="listitem"
      aria-label={title}
      aria-current="step"
      data-testid="setup-step"
    >
      <StepTitle>{title}</StepTitle>
      <StepLabel data-testid="step-number">
        <StepLabelText>{label}</StepLabelText>
      </StepLabel>
      {children}
    </StepRoot>
  );
};
