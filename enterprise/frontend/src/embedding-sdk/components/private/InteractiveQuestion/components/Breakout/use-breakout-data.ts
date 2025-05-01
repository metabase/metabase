import { isNotNull } from "metabase/lib/types";
import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import { useBreakoutQueryHandlers } from "metabase/query_builder/hooks";
import { breakouts as ML_breakouts } from "metabase-lib/breakout";
import type { ColumnMetadata, Query } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../../context";

export interface SDKBreakoutItem extends BreakoutListItem {
  breakoutIndex: number;
  removeBreakout: () => void;
  updateBreakout: (column: ColumnMetadata) => void;
  replaceBreakoutColumn: (column: ColumnMetadata) => void;
}

export const useBreakoutData = (): SDKBreakoutItem[] => {
  const { updateQuestion, ...interactiveQuestionContext } =
    useInteractiveQuestionContext();
  const question = interactiveQuestionContext.question as Question;
  const onQueryChange = (query: Query) => {
    if (question) {
      updateQuestion(question.setQuery(query), { run: true });
    }
  };

  const query = question?.query();
  const stageIndex = -1;

  const { onUpdateBreakout, onRemoveBreakout, onReplaceBreakouts } =
    useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const breakouts = query ? ML_breakouts(query, stageIndex) : [];

  const items: BreakoutListItem[] = query
    ? breakouts
        .map((breakout) => getBreakoutListItem(query, stageIndex, breakout))
        .filter(isNotNull)
    : [];

  return items.map((item, index) => {
    const removeBreakout = () => {
      if (item.breakout) {
        return onRemoveBreakout(item.breakout);
      }
    };

    const updateBreakout = (column: ColumnMetadata) => {
      if (item.breakout) {
        return onUpdateBreakout(item.breakout, column);
      }
    };

    const replaceBreakoutColumn = (column: ColumnMetadata) => {
      return onReplaceBreakouts(column);
    };

    return {
      ...item,
      breakoutIndex: index,
      removeBreakout,
      updateBreakout,
      replaceBreakoutColumn,
    };
  });
};
