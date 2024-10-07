import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import {
  CompareAggregations,
  canAddTemporalCompareAggregation,
} from "metabase/query_builder/components/CompareAggregations";
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

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    !isEditable ||
    !canAddTemporalCompareAggregation(query, stageIndex)
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
    const aggregations = Lib.aggregations(query, stageIndex);

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
