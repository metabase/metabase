import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { CompareAggregations } from "metabase/query_builder/components/CompareAggregations";
import { trackColumnCompareViaColumnHeader } from "metabase/querying/analytics";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const compareAggregationsDrill: Drill<
  Lib.CompareAggregationsDrillThruInfo
> = ({ drill, question, query, stageIndex, clicked }) => {
  const aggregations = Lib.aggregations(query, stageIndex);
  if (
    !clicked.column ||
    !canAddTemporalCompareAggregation(query, stageIndex, aggregations)
  ) {
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
      title: t`Compare to the past`,
      section: "compare-aggregations",
      icon: "lines",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};

function canAddTemporalCompareAggregation(
  query: Lib.Query,
  stageIndex: number,
  aggregations: Lib.AggregationClause[],
): boolean {
  if (aggregations.length === 0) {
    // Hide the "Compare to the past" option if there are no aggregations
    return false;
  }

  const breakoutableColumns = Lib.breakoutableColumns(query, stageIndex);
  const hasAtLeastOneTemporalBreakoutColumn = breakoutableColumns.some(column =>
    Lib.isTemporal(column),
  );

  if (!hasAtLeastOneTemporalBreakoutColumn) {
    // Hide the "Compare to the past" option if there are no
    // temporal columns to break out on
    return false;
  }

  return true;
}
