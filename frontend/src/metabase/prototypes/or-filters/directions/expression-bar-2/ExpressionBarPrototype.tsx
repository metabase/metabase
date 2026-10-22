import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";

/**
 * Iteration 2 copy of direction B2: one expression bar in place of the pills, with Cancel/Apply
 * inside the bar. The same editor sits in the chill-mode strip and in the
 * notebook step.
 */
export function ExpressionBarInline2Prototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const bar = (
    <ExpressionBar
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
      hasInlineActions
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
