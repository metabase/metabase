import { useCallback, useMemo } from "react";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import {
  type AggregationItem,
  getAggregationItems,
} from "metabase/query_builder/utils/get-aggregation-items";
import * as Lib from "metabase-lib";

import { useSdkQuestionContext } from "../../context";

export interface SDKAggregationItem extends AggregationItem {
  stageIndex: number;
  onRemoveAggregation: () => void;
  onUpdateAggregation: (nextClause: Lib.Aggregable) => void;
}

export const useSummarizeData = () => {
  const { question, updateQuestion } = useSdkQuestionContext();
  const tc = useTranslateContent();
  const { locale } = useLocale();

  const query = question?.query();

  const onQueryChange = useCallback(
    (newQuery: Lib.Query) => {
      if (question) {
        updateQuestion(question.setQuery(Lib.dropEmptyStages(newQuery)), {
          run: true,
        });
      }
    },
    [question, updateQuestion],
  );

  const aggregationItems: SDKAggregationItem[] = useMemo(
    () =>
      query
        ? Lib.stageIndexes(query)
            .filter(
              (stageIndex) =>
                !hasAggregationWithoutBreakoutOnPrevStage(query, stageIndex),
            )
            .flatMap((stageIndex) =>
              getAggregationItems({ query, stageIndex }).map(
                (aggregationItem) => {
                  const onRemoveAggregation = () => {
                    if (query) {
                      const nextQuery = Lib.removeClause(
                        query,
                        stageIndex,
                        aggregationItem.aggregation,
                      );
                      onQueryChange(nextQuery);
                    }
                  };

                  const onUpdateAggregation = (nextClause: Lib.Aggregable) => {
                    const nextQuery = Lib.replaceClause(
                      query,
                      stageIndex,
                      aggregationItem.aggregation,
                      nextClause,
                    );
                    onQueryChange(nextQuery);
                  };

                  return {
                    ...aggregationItem,
                    stageIndex,
                    displayName:
                      PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
                        displayName: aggregationItem.displayName,
                        tc,
                        locale,
                      }),
                    onRemoveAggregation,
                    onUpdateAggregation,
                  };
                },
              ),
            )
        : [],
    [onQueryChange, query, tc, locale],
  );

  return aggregationItems;
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
