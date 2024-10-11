import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import {
  OffsetAggregationPicker,
  canAddOffsetAggregation,
} from "metabase/querying/aggregations/components/OffsetAggregationPicker";
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

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    !isEditable ||
    !canAddOffsetAggregation(query, stageIndex)
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

    function handleSubmit(
      nextQuery: Lib.Query,
      aggregations: Lib.ExpressionClause[],
    ) {
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
      <OffsetAggregationPicker
        query={query}
        stageIndex={stageIndex}
        onSubmit={handleSubmit}
        onClose={onClose}
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
