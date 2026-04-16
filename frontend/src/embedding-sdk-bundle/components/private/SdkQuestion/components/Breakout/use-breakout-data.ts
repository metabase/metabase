import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
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
    updateQuestion,
    lastVisibleStageIndex: stageIndex,
    ...interactiveQuestionContext
  } = useSdkQuestionContext();
  const question = interactiveQuestionContext.question as Question;
  const onQueryChange = (nextQuery: Lib.Query) => {
    if (question) {
      updateQuestion(question.setQuery(Lib.dropEmptyStages(nextQuery)), {
        run: true,
      });
    }
  };

  const query = question?.query();

  if (!query) {
    return [];
  }
  const breakouts = Lib.breakouts(query, stageIndex);

  return breakouts
    .map((breakout) => getBreakoutListItem(query, stageIndex, breakout))
    .filter(isNotNull)
    .map((item, index) => {
      const removeBreakout = () => {
        if (item.breakout) {
          const nextQuery = Lib.removeClause(query, stageIndex, item.breakout);
          onQueryChange(nextQuery);
        }
      };

      const updateBreakout = (column: Lib.ColumnMetadata) => {
        if (item.breakout) {
          const nextQuery = Lib.replaceClause(
            query,
            stageIndex,
            item.breakout,
            column,
          );
          onQueryChange(nextQuery);
        }
      };

      const replaceBreakoutColumn = (column: Lib.ColumnMetadata) => {
        const nextQuery = Lib.replaceBreakouts(query, stageIndex, column);
        onQueryChange(nextQuery);
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
