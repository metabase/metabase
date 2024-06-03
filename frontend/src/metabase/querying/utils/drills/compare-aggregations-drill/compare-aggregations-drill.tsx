import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  CompareAggregations,
  getTitle,
} from "metabase/query_builder/components/CompareAggregations";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const compareAggregationsDrill: Drill<
  Lib.CompareAggregationsDrillThruInfo
> = ({ question, query, stageIndex, clicked }) => {
  if (!clicked.column || typeof clicked.column.aggregation_index !== "number") {
    return [];
  }

  const aggregation = Lib.aggregations(query, stageIndex)[
    clicked.column.aggregation_index
  ];

  const DrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();
    return (
      <CompareAggregations
        query={query}
        stageIndex={stageIndex}
        onSubmit={aggregations => {
          const nextQuery = aggregations.reduce(
            (query, aggregation) =>
              Lib.aggregate(query, stageIndex, aggregation),
            query,
          );

          const nextQuestion = question.setQuery(nextQuery);
          const nextCard = nextQuestion.card();

          dispatch(setUIControls({ scrollToLastColumn: true }));
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
        onClose={onClose}
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
