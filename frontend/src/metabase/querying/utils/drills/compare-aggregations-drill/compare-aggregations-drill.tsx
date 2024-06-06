import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  CompareAggregations,
  getOffsetPeriod,
} from "metabase/query_builder/components/CompareAggregations";
import { trackColumnCompareViaColumnHeader } from "metabase/querying/analytics";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const compareAggregationsDrill: Drill<
  Lib.CompareAggregationsDrillThruInfo
> = ({ drill, question, query, stageIndex, clicked }) => {
  if (!clicked.column) {
    return [];
  }

  const { aggregation } = Lib.aggregationDrillDetails(drill);

  const DrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();

    return (
      <CompareAggregations
        aggregations={[aggregation]}
        query={query}
        stageIndex={stageIndex}
        onClose={onClose}
        onSubmit={aggregations => {
          const nextQuery = aggregations.reduce(
            (query, aggregation) =>
              Lib.aggregate(query, stageIndex, aggregation),
            query,
          );

          const nextQuestion = question.setQuery(nextQuery);
          const nextCard = nextQuestion.card();

          trackColumnCompareViaColumnHeader(
            nextQuery,
            stageIndex,
            aggregations,
            nextQuestion.id(),
          );

          dispatch(setUIControls({ scrollToLastColumn: true }));
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
      />
    );
  };

  return [
    {
      name: "compare-aggregations",
      title: getTitle(query, stageIndex, aggregation),
      section: "compare-aggregations",
      icon: "lines",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};

export const getTitle = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | Lib.ExpressionClause,
): string => {
  const period = getOffsetPeriod(query, stageIndex);
  const info = Lib.displayInfo(query, stageIndex, aggregation);

  return t`Compare “${info.displayName}” to previous ${period}`;
};
