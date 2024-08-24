import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import type { NotebookStepProps } from "../../types";
import { AggregateStep } from "../AggregateStep";
import { BreakoutStep } from "../BreakoutStep";

export function SummarizeStep({
  step,
  color,
  isLastOpened,
  ...props
}: NotebookStepProps) {
  const isMetric = step.question.type() === "metric";

  return (
    <Flex align="center" direction={{ base: "column", md: "row" }} gap="sm">
      <Box w={{ base: "100%", md: "50%" }}>
        <AggregateStep
          step={step}
          color={color}
          isLastOpened={isLastOpened}
          {...props}
        />
      </Box>
      {!isMetric && <Box c={color} fw="bold">{t`by`}</Box>}
      <Box w={{ base: "100%", md: "50%" }}>
        {isMetric && (
          <Box display={{ md: "none" }} c="summarize" fw="bold" mb="sm">
            {t`Default time dimension`}
          </Box>
        )}
        <BreakoutStep
          step={step}
          color={color}
          isLastOpened={false}
          {...props}
        />
      </Box>
    </Flex>
  );
}
