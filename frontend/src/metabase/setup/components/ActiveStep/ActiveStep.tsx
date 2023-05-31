import { ReactNode } from "react";
import {
  StepRoot,
  StepTitle,
  StepLabel,
  StepLabelText,
} from "./ActiveStep.styled";

export interface ActiveStepProps {
  title: string;
  label: number;
  children?: ReactNode;
}

const ActiveStep = ({
  title,
  label,
  children,
}: ActiveStepProps): JSX.Element => {
  return (
    <StepRoot>
      <StepTitle>{title}</StepTitle>
      <StepLabel>
        <StepLabelText>{label}</StepLabelText>
      </StepLabel>
      {children}
    </StepRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActiveStep;
