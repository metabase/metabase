import { t } from "ttag";

import { ExtractColumn } from "metabase/query_builder/components/expressions/ExtractColumn";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const ExtractColumnAction: LegacyDrill = ({ question, clicked }) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    clicked?.extraData?.isRawTable ||
    !isEditable
  ) {
    return [];
  }

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const query = question.query();
    const stageIndex = -1;

    function handleSubmit(
      _clause: Lib.Clause,
      _name: string,
      extraction: Lib.ColumnExtraction,
    ) {
      const newQuery = Lib.extract(query, stageIndex, extraction);

      const nextQuestion = question.setQuery(newQuery);
      const nextCard = nextQuestion.card();

      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <ExtractColumn
        query={query}
        stageIndex={stageIndex}
        onSubmit={handleSubmit}
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
      section: "extract",
      popover: Popover,
    },
  ];
};
