import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import type { NotebookStepUiComponentProps } from "../types";

import { AggregateStep } from "./AggregateStep";
import BreakoutStep from "./BreakoutStep";

function SummarizeStep({
  color,
  isLastOpened,
  step,
  ...props
}: NotebookStepUiComponentProps) {
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
      <Box c={color} fw="bold">{t`by`}</Box>
      <Box w={{ base: "100%", md: "50%" }}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SummarizeStep;
