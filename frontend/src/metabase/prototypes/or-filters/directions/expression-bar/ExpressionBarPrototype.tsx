import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";

/**
 * Direction B: one expression bar in place of the pills. The same editor
 * sits in the chill-mode strip and in the notebook step.
 */
export function ExpressionBarPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const bar = (
    <ExpressionBar query={query} stageIndex={stageIndex} onChange={onChange} />
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
