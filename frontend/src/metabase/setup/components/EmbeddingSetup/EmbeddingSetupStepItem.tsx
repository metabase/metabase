import type { IconName } from "metabase/ui";

import {
  StepCircle,
  StepContent,
  StepIcon,
  StepNumber, // Assuming StepNumber might still be used if no icon for pending
  StepTitle,
  StepWrapper,
} from "./EmbeddingSetupStepItem.styled";

export type StepStatus = "completed" | "active" | "pending";

interface EmbeddingSetupStepItemProps {
  status: StepStatus;
  title: string;
  stepNumber?: number; // For pending/active if no specific icon
  iconName?: IconName; // For specific icons like 'check', 'bolt', 'code'
}

export const EmbeddingSetupStepItem = ({
  status,
  title,
  stepNumber,
  iconName,
}: EmbeddingSetupStepItemProps) => {
  const renderCircleContent = () => {
    if (status === "completed" && iconName === "check") {
      return <StepIcon name="check" />;
    }
    if (status === "active" && iconName === "bolt") {
      return <StepIcon name="bolt" />;
    }
    // Placeholder for {=} icon - assuming 'code' or similar exists
    // Or fallback to number if no suitable icon for pending
    if (status === "pending" && iconName) {
      return <StepIcon name={iconName} />;
    }
    if (stepNumber) {
      return <StepNumber>{stepNumber}</StepNumber>;
    }
    return null;
  };

  return (
    <StepWrapper status={status}>
      <StepContent>
        <StepCircle status={status}>{renderCircleContent()}</StepCircle>
        <StepTitle status={status}>{title}</StepTitle>
      </StepContent>
    </StepWrapper>
  );
};
