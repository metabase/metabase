/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import AggregateStep from "./AggregateStep";
import BreakoutStep from "./BreakoutStep";
import { StepContainer, StepLabel, StepRoot } from "./SummarizeStep.styled";

export default function SummarizeStep({
  color,
  query,
  isLastOpened,
  ...props
}) {
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
        <BreakoutStep color={color} query={query} {...props} />
      </StepContainer>
    </StepRoot>
  );
}
