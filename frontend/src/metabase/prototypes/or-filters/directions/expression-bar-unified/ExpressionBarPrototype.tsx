import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";
import { SummaryPills } from "./SummaryPills";

type UnifiedBarProps = FilterUiProps & {
  summaryPlacement?: "caret" | "end";
  /** `"pills"` keeps the summary out of the expression: a pill zone after it, with its own button. */
  summaryUi?: "inline" | "pills";
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
  summaryUi = "inline",
  onChange,
}: UnifiedBarProps) {
  const bar = (
    <ExpressionBar
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
      withSummary={summaryUi === "inline"}
      summaryPlacement={summaryPlacement}
      trailing={
        summaryUi === "pills" && (
          <SummaryPills
            query={query}
            stageIndex={stageIndex}
            onChange={onChange}
          />
        )
      }
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

/** Variant: the expression is the rows only; filters on the summary are pills after it. */
export function ExpressionBarSplitPrototype(props: FilterUiProps) {
  return <UnifiedBar {...props} summaryUi="pills" />;
}
