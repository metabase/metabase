import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import { useBreakoutQueryHandlers } from "metabase/query_builder/hooks";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useSdkQuestionContext } from "../../context";

export interface SDKBreakoutItem extends BreakoutListItem {
  breakoutIndex: number;
  removeBreakout: () => void;
  updateBreakout: (column: Lib.ColumnMetadata) => void;
  replaceBreakoutColumn: (column: Lib.ColumnMetadata) => void;
}

export const useBreakoutData = (): SDKBreakoutItem[] => {
  const {
    updateAndNormalizeQuestion,
    lastVisibleStageIndex: stageIndex,
    ...interactiveQuestionContext
  } = useSdkQuestionContext();
  const question = interactiveQuestionContext.question as Question;
  const query = question?.query();

  const onQueryChange = (nextQuery: Lib.Query) => {
    if (question) {
      updateAndNormalizeQuestion(question.setQuery(nextQuery), { run: true });
    }
  };

  const { onUpdateBreakout, onRemoveBreakout, onReplaceBreakouts } =
    useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  if (!query) {
    return [];
  }

  return Lib.breakouts(query, stageIndex)
    .map((breakout) => getBreakoutListItem(query, stageIndex, breakout))
    .filter(isNotNull)
    .map((item, index) => ({
      ...item,
      breakoutIndex: index,
      removeBreakout: () => {
        if (item.breakout) {
          onRemoveBreakout(item.breakout);
        }
      },
      updateBreakout: (column: Lib.ColumnMetadata) => {
        if (item.breakout) {
          onUpdateBreakout(item.breakout, column);
        }
      },
      replaceBreakoutColumn: (column: Lib.ColumnMetadata) => {
        onReplaceBreakouts(column);
      },
    }));
};
