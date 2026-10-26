import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";

type UnifiedBarProps = FilterUiProps & {
  summaryPlacement?: "caret" | "end";
};

/**
 * Iteration 3: one expression bar for the rows and the summary alike. Filters
 * on the summary sit in the same stream as tinted pills and go back to their
 * own stage on apply. The same editor sits in the chill-mode strip and in the
 * notebook step.
 */
function UnifiedBar({
  query,
  stageIndex,
  variant,
  summaryPlacement,
  onChange,
}: UnifiedBarProps) {
  const bar = (
    <ExpressionBar
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
      withSummary
      summaryPlacement={summaryPlacement}
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

export function ExpressionBarUnifiedPrototype(props: FilterUiProps) {
  return <UnifiedBar {...props} />;
}

/** Variant: a picked filter on the summary always lands at the end, AND-ed on. */
export function ExpressionBarUnifiedTailPrototype(props: FilterUiProps) {
  return <UnifiedBar {...props} summaryPlacement="end" />;
}
