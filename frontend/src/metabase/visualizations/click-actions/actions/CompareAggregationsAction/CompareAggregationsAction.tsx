import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import { CompareAggregations } from "metabase/query_builder/components/CompareAggregations";
import { getQuestion } from "metabase/query_builder/selectors";
import { trackColumnCompareViaPlusModal } from "metabase/querying/analytics";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const CompareAggregationsAction: LegacyDrill = ({
  question,
  clicked,
}) => {
  const query = question.query();
  const stageIndex = -1;
  const { isEditable } = Lib.queryDisplayInfo(query);
  const aggregations = Lib.aggregations(query, stageIndex);

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    !isEditable ||
    !canAddTemporalCompareAggregation(query, stageIndex, aggregations)
  ) {
    return [];
  }

  const title = t`Compare to the past`;

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const currentQuestion = useSelector(getQuestion);
    const dispatch = useDispatch();

    function handleSubmit(aggregations: Lib.ExpressionClause[]) {
      const nextQuery = aggregations.reduce(
        (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
        query,
      );

      const nextQuestion = checkNotNull(currentQuestion).setQuery(nextQuery);
      const nextCard = nextQuestion.card();

      trackColumnCompareViaPlusModal(
        nextQuery,
        stageIndex,
        aggregations,
        nextQuestion.id(),
      );

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <CompareAggregations
        aggregations={aggregations}
        query={query}
        stageIndex={stageIndex}
        onClose={onClose}
        onSubmit={handleSubmit}
      />
    );
  };

  return [
    {
      name: "compare-aggregations",
      title,
      tooltip: title,
      buttonType: "horizontal",
      icon: "lines",
      default: true,
      section: "new-column",
      popover: Popover,
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
