import { t } from "ttag";

import { Box } from "metabase/ui";

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
    <Box c={color} fw="bold" mb="sm">
      {t`Formula`}
    </Box>
  );
}
