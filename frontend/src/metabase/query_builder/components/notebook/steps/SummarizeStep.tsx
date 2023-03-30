import React from "react";
import { t } from "ttag";

import type { NotebookStepUiComponentProps } from "../types";
import AggregateStep from "./AggregateStep";
import BreakoutStep from "./BreakoutStep";
import { StepContainer, StepLabel, StepRoot } from "./SummarizeStep.styled";

function SummarizeStep({
  color,
  query,
  isLastOpened,
  ...props
}: NotebookStepUiComponentProps) {
  return (
    <StepRoot>
      <StepContainer>
        <AggregateStep
          color={color}
          query={query}
          isLastOpened={isLastOpened}
          {...props}
        />
      </StepContainer>
      <StepLabel color={color}>{t`by`}</StepLabel>
      <StepContainer>
        <BreakoutStep
          color={color}
          query={query}
          isLastOpened={false}
          {...props}
        />
      </StepContainer>
    </StepRoot>
  );
}

export default SummarizeStep;
