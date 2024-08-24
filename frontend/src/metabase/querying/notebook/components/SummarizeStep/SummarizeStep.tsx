import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import type { NotebookStepUiComponentProps } from "../../types";
import { AggregateStep } from "../AggregateStep";
import { BreakoutStep } from "../BreakoutStep";

export function SummarizeStep({
  step,
  color,
  isLastOpened,
  ...props
}: NotebookStepUiComponentProps) {
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
          <Box pos="relative">
            <Box
              pos={{ md: "absolute" }}
              bottom={0}
              mb="sm"
              c="summarize"
              fw="bold"
            >
              {t`Default time dimension`}
            </Box>
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
