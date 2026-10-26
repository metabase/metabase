import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { StagedExpressionBar } from "./StagedExpressionBar";

/**
 * Iteration 3 copy of direction B2: one expression bar in place of the pills, with Cancel/Apply
 * inside the bar, plus a trailing segment for filters on the summary. The same
 * editor sits in the chill-mode strip and in the notebook step.
 */
export function ExpressionBarInline3Prototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const bar = (
    <StagedExpressionBar
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
    />
  );

  if (variant === "chill") {
    return (
      <Group gap="sm" align="flex-start" w="100%">
        {bar}
      </Group>
    );
  }

  return <NotebookCell color="core-filter">{bar}</NotebookCell>;
}
