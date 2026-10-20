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
  hasInlineActions,
}: FilterUiProps & { hasInlineActions?: boolean }) {
  const bar = (
    <ExpressionBar
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
      hasInlineActions={hasInlineActions}
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

/** Direction B2: B with Cancel/Apply inside the bar and a hideable strip. */
export function ExpressionBarInlinePrototype(props: FilterUiProps) {
  return <ExpressionBarPrototype {...props} hasInlineActions />;
}
