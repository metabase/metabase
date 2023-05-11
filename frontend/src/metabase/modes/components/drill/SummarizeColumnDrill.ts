import { t } from "ttag";

import type {
  ClickAction,
  ClickActionProps,
  ClickActionBase,
  Drill,
} from "metabase/modes/types";
import type { Dispatch } from "metabase-types/store";
import {
  summarizeColumnDrill,
  summarizeColumnDrillQuestion,
} from "metabase-lib/queries/drills/summarize-column-drill";

type AggregationOperator = {
  short: string;
};

const ACTIONS: Record<string, Omit<ClickActionBase, "name">> = {
  sum: {
    title: t`Sum`,
    section: "sum",
    buttonType: "token",
  },
  avg: {
    title: t`Avg`,
    section: "sum",
    buttonType: "token",
  },
  distinct: {
    title: t`Distinct values`,
    section: "sum",
    buttonType: "token",
  },
};

function getAction(
  operator: AggregationOperator,
  { question, clicked }: ClickActionProps,
): ClickAction {
  return {
    ...ACTIONS[operator.short],
    name: operator.short,
    question: () =>
      summarizeColumnDrillQuestion({
        question,
        clicked,
        aggregationOperator: operator,
      }),
    action: () => (dispatch: Dispatch) =>
      // HACK: drill through closes sidebars, so open sidebar asynchronously
      setTimeout(() => dispatch({ type: "metabase/qb/EDIT_SUMMARY" })),
  };
}

const SummarizeColumnDrill: Drill = opts => {
  const { question, clicked } = opts;

  const drill = summarizeColumnDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { aggregationOperators } = drill;

  return aggregationOperators
    .filter(operator => operator)
    .map(operator => getAction(operator as AggregationOperator, opts));
};

export default SummarizeColumnDrill;
