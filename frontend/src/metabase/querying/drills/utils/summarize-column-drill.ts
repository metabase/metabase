import { t } from "ttag";

import type {
  ClickActionBase,
  Drill,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import type { Dispatch } from "metabase-types/store";

const ACTIONS: Record<Lib.SummarizeColumnDrillThruOperator, ClickActionBase> = {
  sum: {
    name: "summarize-column.sum",
    title: t`Sum`,
    section: "sum",
    buttonType: "token",
  },
  avg: {
    name: "summarize-column.avg",
    title: t`Avg`,
    section: "sum",
    buttonType: "token",
  },
  distinct: {
    name: "summarize-column.distinct",
    title: t`Distinct values`,
    section: "sum",
    buttonType: "token",
  },
};

export const summarizeColumnDrill: Drill<Lib.SummarizeColumnDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { aggregations } = drillInfo;

  return aggregations.map(operator => ({
    ...ACTIONS[operator],
    question: () => applyDrill(drill, operator).setDefaultDisplay(),
    action: () => (dispatch: Dispatch) =>
      // HACK: drill through closes sidebars, so open sidebar asynchronously
      setTimeout(() => dispatch({ type: "metabase/qb/EDIT_SUMMARY" })),
  }));
};
