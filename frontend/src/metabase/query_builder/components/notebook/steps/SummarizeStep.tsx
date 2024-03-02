import { t } from "ttag";

import type { NotebookStepUiComponentProps } from "../types";

import { AggregateStep } from "./AggregateStep";
import BreakoutStep from "./BreakoutStep";
import { StepContainer, StepLabel, StepRoot } from "./SummarizeStep.styled";

function SummarizeStep({
  color,
  isLastOpened,
  ...props
}: NotebookStepUiComponentProps) {
  return (
    <StepRoot>
      <StepContainer>
        <AggregateStep color={color} isLastOpened={isLastOpened} {...props} />
      </StepContainer>
      <StepLabel color={color}>{t`by`}</StepLabel>
      <StepContainer>
        <BreakoutStep color={color} isLastOpened={false} {...props} />
      </StepContainer>
    </StepRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SummarizeStep;
