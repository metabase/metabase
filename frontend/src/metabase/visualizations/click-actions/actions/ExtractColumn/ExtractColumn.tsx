import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnExtractViaPlusModal } from "metabase/query_builder/analytics";
import {
  ExtractColumn,
  hasExtractions,
} from "metabase/query_builder/components/expressions/ExtractColumn";
import { getQuestion } from "metabase/query_builder/selectors";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const ExtractColumnAction: LegacyDrill = ({ question, clicked }) => {
  const { query, stageIndex } = Lib.asReturned(question.query(), -1);

  const { isEditable } = Lib.queryDisplayInfo(query);

  if (
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
      <ExtractColumn
        query={query}
        stageIndex={stageIndex}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
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
