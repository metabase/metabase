import { t } from "ttag";
import {
  summarizeColumnDrill,
  summarizeColumnDrillQuestion,
} from "metabase-lib/lib/queries/drills/summarize-column-drill";

const ACTIONS = {
  sum: {
    name: "sum",
    title: t`Sum`,
    section: "sum",
    buttonType: "token",
  },
  avg: {
    name: "avg",
    title: t`Avg`,
    section: "sum",
    buttonType: "token",
  },
  distinct: {
    name: "distinct",
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

  return drill.aggregationOperators.map(aggregationOperator => ({
    ...ACTIONS[aggregationOperator.short],
    question: () =>
      summarizeColumnDrillQuestion({ question, clicked, aggregationOperator }),
    action: () => dispatch => {
      // HACK: drill through closes sidebars, so open sidebar asynchronously
      setTimeout(() => dispatch({ type: "metabase/qb/EDIT_SUMMARY" }));
    },
  }));
};
