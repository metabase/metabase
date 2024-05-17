import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnCombineViaPlusModal } from "metabase/query_builder/analytics";
import { CombineColumns } from "metabase/query_builder/components/expressions/CombineColumns";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const CombineColumnsAction: LegacyDrill = ({ question, clicked }) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.columnShortcuts ||
    clicked.extraData?.isRawTable ||
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
    const dispatch = useDispatch();

    function handleSubmit(name: string, clause: Lib.ExpressionClause) {
      const newQuery = Lib.expression(query, stageIndex, name, clause);
      const nextQuestion = question.setQuery(newQuery);
      const nextCard = nextQuestion.card();

      trackColumnCombineViaPlusModal(newQuery, nextQuestion);

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <CombineColumns
        query={query}
        stageIndex={stageIndex}
        onSubmit={handleSubmit}
        width={474}
      />
    );
  };

  return [
    {
      name: "column-combine",
      title: t`Combine columns`,
      tooltip: t`Combine columns`,
      buttonType: "horizontal",
      icon: "combine",
      default: true,
      section: "new-column",
      popover: Popover,
    },
  ];
};
