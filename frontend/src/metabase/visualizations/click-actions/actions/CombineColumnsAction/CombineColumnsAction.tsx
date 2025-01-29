import { t } from "ttag";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnCombineViaPlusModal } from "metabase/query_builder/analytics";
import {
  CombineColumns,
  hasCombinations,
} from "metabase/query_builder/components/expressions/CombineColumns";
import { getQuestion } from "metabase/query_builder/selectors";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const CombineColumnsAction: LegacyDrill = ({ question, clicked }) => {
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
    !hasCombinations(query, stageIndex)
  ) {
    return [];
  }

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const currentQuestion = useSelector(getQuestion);
    const dispatch = useDispatch();

    function handleSubmit(name: string, clause: Lib.ExpressionClause) {
      const newQuery = Lib.expression(query, stageIndex, name, clause);
      const nextQuestion = checkNotNull(currentQuestion).setQuery(newQuery);
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
