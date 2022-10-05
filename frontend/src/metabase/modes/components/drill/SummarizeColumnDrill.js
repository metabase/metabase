import { t } from "ttag";
import {
  summarizeColumnDrill,
  summarizeColumnDrillQuestion,
} from "metabase-lib/lib/queries/drills/summarize-column-drill";

const ACTIONS = {
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

export default ({ question, clicked = {} }) => {
  const drill = summarizeColumnDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { aggregationOperators } = drill;

  return aggregationOperators.map(aggregationOperator => ({
    ...ACTIONS[aggregationOperator.short],
    name: aggregationOperator.short,
    question: () =>
      summarizeColumnDrillQuestion({ question, clicked, aggregationOperator }),
    action: () => dispatch =>
      // HACK: drill through closes sidebars, so open sidebar asynchronously
      setTimeout(() => dispatch({ type: "metabase/qb/EDIT_SUMMARY" })),
  }));
};
