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
  step,
  ...props
}: NotebookStepUiComponentProps) {
  return (
    <StepRoot>
      <StepContainer>
        <AggregateStep
          color={color}
          query={query}
          step={step}
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
          step={{
            ...step,
            // Temporal workaround as BreakoutStep uses MLv2 and AggregateStep uses MLv1
            // Once AggregationStep is migrated, "summarize" should be added to
            // MLV2_STEPS in notebook/lib/steps
            stageIndex: step.isLastStage ? -1 : step.stageIndex,
          }}
        />
      </StepContainer>
    </StepRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SummarizeStep;
