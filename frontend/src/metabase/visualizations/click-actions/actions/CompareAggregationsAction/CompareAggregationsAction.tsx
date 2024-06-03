import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { CompareAggregations } from "metabase/query_builder/components/CompareAggregations";
import { Box } from "metabase/ui";
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

      // trackColumnExtractViaPlusModal(
      //   newQuery,
      //   stageIndex,
      //   extraction,
      //   nextQuestion,
      // );

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <Box>
        <CompareAggregations
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      </Box>
    );
  };

  return [
    {
      name: "compare-aggregations",
      title: t`Compare to previous month`, // TODO
      tooltip: t`Compare to previous month`, // TODO
      buttonType: "horizontal",
      icon: "lines",
      default: true,
      section: "new-column",
      popover: Popover,
    },
  ];
};
