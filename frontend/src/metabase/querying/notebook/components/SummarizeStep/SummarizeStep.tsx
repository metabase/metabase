import { t } from "ttag";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { AggregateStep } from "../AggregateStep";
import { BreakoutStep } from "../BreakoutStep";

export function SummarizeStep({
  step,
  color,
  isLastOpened,
  readOnly,
  ...props
}: NotebookStepProps) {
  const isMetric = step.question.type() === "metric";

  const hasBreakouts = Lib.breakouts(step.query, step.stageIndex).length > 0;
  const showBreakouts = !readOnly || hasBreakouts;

  return (
    <Flex
      align={{ md: "center" }}
      direction={{ base: "column", md: "row" }}
      gap={{ base: "sm", md: isMetric ? "md" : "sm" }}
    >
      <Box w={{ base: "100%", md: "50%" }} flex="1 1 auto">
        <AggregateStep
          step={step}
          color={color}
          isLastOpened={isLastOpened}
          readOnly={readOnly}
          {...props}
        />
      </Box>
      {isMetric ? (
        <Box display={{ md: "none" }} c={color} fw="bold">
          {t`Default time dimension`}
        </Box>
      ) : (
        showBreakouts && <Box c={color} fw="bold">{t`by`}</Box>
      )}
      {showBreakouts && (
        <Box w={{ base: "100%", md: "50%" }}>
          <BreakoutStep
            step={step}
            color={color}
            isLastOpened={false}
            readOnly={readOnly}
            {...props}
          />
        </Box>
      )}
    </Flex>
  );
}
