import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useSdkQuestionContext } from "../../context";

export interface SDKBreakoutItem extends BreakoutListItem {
  stageIndex: number;
  breakoutIndex: number;
  removeBreakout: () => void;
  updateBreakout: (column: Lib.ColumnMetadata) => void;
  replaceBreakoutColumn: (column: Lib.ColumnMetadata) => void;
}

export const useBreakoutData = (): SDKBreakoutItem[] => {
  const { updateQuestion, ...interactiveQuestionContext } =
    useSdkQuestionContext();
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

  return Lib.stageIndexes(query)
    .filter(
      (stageIndex) =>
        !hasAggregationWithoutBreakoutOnPrevStage(query, stageIndex),
    )
    .flatMap((stageIndex) => {
      const breakouts = Lib.breakouts(query, stageIndex);

      return breakouts
        .map((breakout) => getBreakoutListItem(query, stageIndex, breakout))
        .filter(isNotNull)
        .map((item, index) => {
          const removeBreakout = () => {
            if (item.breakout) {
              const nextQuery = Lib.removeClause(
                query,
                stageIndex,
                item.breakout,
              );
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
            stageIndex,
            breakoutIndex: index,
            removeBreakout,
            updateBreakout,
            replaceBreakoutColumn,
          };
        });
    });
};

/**
 * Matches the notebook editor's logic: a stage is hidden when
 * the previous stage has aggregations but no breakouts.
 * See `getQuestionSteps` in notebook/utils/steps.ts.
 */
function hasAggregationWithoutBreakoutOnPrevStage(
  query: Lib.Query,
  stageIndex: number,
) {
  if (stageIndex >= 1) {
    const hasAggregations = Lib.aggregations(query, stageIndex - 1).length > 0;
    const hasBreakouts = Lib.breakouts(query, stageIndex - 1).length > 0;
    return hasAggregations && !hasBreakouts;
  }
  return false;
}
