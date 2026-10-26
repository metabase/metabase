import { useContext } from "react";

import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Group } from "metabase/ui";

import type { FilterUiProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";
import { SummaryMenu } from "./SummaryMenu";
import { SummaryPills } from "./SummaryPills";
import { type SummaryPlacement, SummaryPlacementContext } from "./settings";

type UnifiedBarProps = FilterUiProps & {
  summaryPlacement?: SummaryPlacement;
  /** `"pills"` keeps the summary out of the expression: a pill zone after it, with its own button. */
  summaryUi?: "inline" | "pills" | "menu";
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
        summaryUi === "pills" ? (
          <SummaryPills
            query={query}
            stageIndex={stageIndex}
            onChange={onChange}
          />
        ) : summaryUi === "menu" ? (
          <SummaryMenu
            query={query}
            stageIndex={stageIndex}
            onChange={onChange}
          />
        ) : undefined
      }
      actionsPlacement={summaryUi === "inline" ? "inline" : "below"}
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

/**
 * The harness picks where a summary filter lands (`SummaryPlacementContext`):
 * at the caret, where mixing it with row filters is an error, or at the end.
 */
export function ExpressionBarUnifiedPrototype(props: FilterUiProps) {
  const summaryPlacement = useContext(SummaryPlacementContext);
  return <UnifiedBar {...props} summaryPlacement={summaryPlacement} />;
}

/** Variant: the expression is the rows only; filters on the summary are pills after it. */
export function ExpressionBarSplitPrototype(props: FilterUiProps) {
  return <UnifiedBar {...props} summaryUi="pills" />;
}

/** Variant: the rows-only expression with the summary's filters folded into a split Σ button. */
export function ExpressionBarSummaryMenuPrototype(props: FilterUiProps) {
  return <UnifiedBar {...props} summaryUi="menu" />;
}
