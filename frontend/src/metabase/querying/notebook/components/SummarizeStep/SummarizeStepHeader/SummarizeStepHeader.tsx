import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import type { NotebookStepHeaderProps } from "../../../types";
import { NotebookStepHeader } from "../../NotebookStep/NotebookStepHeader";

export function SummarizeStepHeader({
  step,
  title,
  color,
  canRevert,
  onRevert,
}: NotebookStepHeaderProps) {
  const isMetric = step.question.type() === "metric";
  if (!isMetric) {
    return (
      <NotebookStepHeader
        step={step}
        title={title}
        color={color}
        canRevert={canRevert}
        onRevert={onRevert}
      />
    );
  }

  return (
    <Flex c={color} fw="bold" mb="sm" gap="md">
      <Box w="50%">{t`Formula`}</Box>
      <Box display={{ base: "none", md: "block" }} w="50%">
        {t`Default time dimension`}
      </Box>
    </Flex>
  );
}
