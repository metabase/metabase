import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  CompareAggregations,
  getTitle,
} from "metabase/query_builder/components/CompareAggregations";
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
    Lib.aggregations(query, stageIndex).length === 0
  ) {
    return [];
  }

  const title = getTitle(query, stageIndex);

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();

    function handleSubmit(aggregations: Lib.ExpressionClause[]) {
      const nextQuery = aggregations.reduce(
        (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
        query,
      );

      const nextQuestion = question.setQuery(nextQuery);
      const nextCard = nextQuestion.card();

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <CompareAggregations
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
