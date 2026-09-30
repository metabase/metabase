import { t } from "ttag";

import {
  ExpressionWidget,
  useExpressionWidgetChunk,
} from "metabase/querying/components/expressions";
import { useDispatch } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ClickActionPopoverProps } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

/**
 * Replaces the "+" ("New column") menu's separate "Extract part of column"
 * and "Combine columns" entries with a single, general "Add formula
 * column" entry — one path to add a custom column instead of two narrower
 * ones, using the same expression editor (ExpressionWidget) the notebook
 * editor's own "Custom column" step already uses. Extraction (splitting a
 * URL/date/email apart) and column-combining are both still expressible
 * as ordinary formulas here (e.g. `domain([URL])`, `[First] ++ " " ++
 * [Last]`) via that editor's own function/operator support — this isn't a
 * capability loss, just one unified entry point instead of two.
 */
export const AddFormulaColumnAction: LegacyDrill = ({ question, clicked }) => {
  if (!clicked || clicked.value !== undefined || !clicked.columnShortcuts) {
    return [];
  }

  const { query, stageIndex } = Lib.asReturned(
    question.query(),
    -1,
    question.id(),
  );
  const { isEditable } = Lib.queryDisplayInfo(query);

  if (!isEditable) {
    return [];
  }

  const availableColumns = Lib.expressionableColumns(query, stageIndex);

  const Popover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();
    // The expression editor (CodeMirror + its extensions) is a separate
    // chunk nothing else needs on first paint — hold the popover empty
    // until it's ready rather than showing it a beat late (see lazy.tsx).
    const isWidgetLoaded = useExpressionWidgetChunk();

    if (!isWidgetLoaded) {
      return null;
    }

    function handleChangeClause(name: string, clause: Lib.ExpressionClause) {
      const newQuery = Lib.expression(query, stageIndex, name, clause);
      const nextQuestion = question.setQuery(newQuery);
      const nextCard = nextQuestion.card();

      dispatch(setUIControls({ scrollToLastColumn: true }));
      onChangeCardAndRun({ nextCard });
      onClose();
    }

    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        availableColumns={availableColumns}
        withName
        onChangeClause={handleChangeClause}
        onClose={onClose}
      />
    );
  };

  return [
    {
      name: "column-formula",
      title: t`Add formula column`,
      tooltip: t`Add formula column`,
      buttonType: "horizontal",
      icon: "formula",
      default: true,
      section: "new-column",
      popover: Popover,
    },
  ];
};
