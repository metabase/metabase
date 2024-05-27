import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnExtractViaPlusModal } from "metabase/query_builder/analytics";
import { ExtractColumn } from "metabase/query_builder/components/expressions/ExtractColumn";
import { rem, Box } from "metabase/ui";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const ExtractColumnAction: LegacyDrill = ({ question, clicked }) => {
  const { query, stageIndex } = Lib.asReturned(question.query(), -1);

  const { isEditable } = Lib.queryDisplayInfo(query);
  const expressionableColumns = Lib.expressionableColumns(query, stageIndex);
  const isExtractable =
    expressionableColumns.reduce(function (sum, column) {
      return sum + Lib.columnExtractions(query, column).length;
    }, 0) > 0;

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    !isEditable ||
    !isExtractable
  ) {
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
