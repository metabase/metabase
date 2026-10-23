import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { StagedExpressionBar } from "./StagedExpressionBar";

/**
 * Expression bar with structure editing: the inline-stages bar (Cancel/Apply
 * inside, a trailing segment for filters on the summary) plus range
 * selection, operator and parenthesis menus, and `not`. The same editor sits
 * in the chill-mode strip and in the notebook step.
 */
export function ExpressionBarStructurePrototype({
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
