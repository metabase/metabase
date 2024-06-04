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
> = ({ drillInfo, question, query, stageIndex, clicked }) => {
  if (!clicked.column) {
    return [];
  }

  const aggregations = Lib.aggregations(query, stageIndex);
  const aggregation = aggregations[drillInfo.aggregationIndex];

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
