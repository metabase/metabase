import { t } from "ttag";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnExtractViaPlusModal } from "metabase/query_builder/analytics";
import {
  ExtractColumn,
  hasExtractions,
} from "metabase/query_builder/components/expressions/ExtractColumn";
import { getQuestion } from "metabase/query_builder/selectors";
import { Box, rem } from "metabase/ui";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const ExtractColumnAction: LegacyDrill = ({ question, clicked }) => {
  let query: Lib.Query | null = null;
  let stageIndex = -1;
  let isEditable = true;

  // HACK: we should pass column's question instance to this function
  const isVisualizer = _.isEqual(Object.keys(question.card()), [
    "display",
    "visualization_settings",
  ]);

  if (!isVisualizer) {
    const result = Lib.asReturned(question.query(), -1, question.id());
    query = result.query;
    stageIndex = result.stageIndex;
    isEditable = Lib.queryDisplayInfo(query).isEditable;
  }

  if (
    !query ||
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    !isEditable ||
    !hasExtractions(query, stageIndex)
  ) {
    return [];
  }

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const currentQuestion = useSelector(getQuestion);
    const dispatch = useDispatch();

    function handleSubmit(
      _clause: Lib.Clause,
      _name: string,
      extraction: Lib.ColumnExtraction,
    ) {
      const newQuery = Lib.extract(query, stageIndex, extraction);
      const nextQuestion = checkNotNull(currentQuestion).setQuery(newQuery);
      const nextCard = nextQuestion.card();

      trackColumnExtractViaPlusModal(
        newQuery,
        stageIndex,
        extraction,
        nextQuestion,
      );

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <Box mah={rem(550)}>
        <ExtractColumn
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </Box>
    );
  };

  return [
    {
      name: "column-extract",
      title: t`Extract part of column`,
      tooltip: t`Extract part of column`,
      buttonType: "horizontal",
      icon: "arrow_split",
      default: true,
      section: "new-column",
      popover: Popover,
    },
  ];
};
