import { t } from "ttag";

import { trackColumnExtractViaPlusModal } from "metabase/querying/analytics";
import {
  ExtractColumn,
  hasExtractions,
} from "metabase/querying/components/expressions";
import { useDispatch } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { Box, rem } from "metabase/ui";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const ExtractColumnAction: LegacyDrill = ({ question, clicked }) => {
  if (!clicked || clicked.value !== undefined || !clicked.columnShortcuts) {
    return [];
  }

  const { query, stageIndex } = Lib.asReturned(
    question.query(),
    -1,
    question.id(),
  );
  const { isEditable } = Lib.queryDisplayInfo(query);
  const availableColumns = Lib.expressionableColumns(query, stageIndex);

  if (!isEditable || !hasExtractions(query, availableColumns)) {
    return [];
  }

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();

    function handleSubmit(
      _clause: Lib.Clause,
      _name: string,
      extraction: Lib.ColumnExtraction,
    ) {
      const newQuery = Lib.extract(query, stageIndex, extraction);
      const nextQuestion = question.setQuery(newQuery);
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
          availableColumns={availableColumns}
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
