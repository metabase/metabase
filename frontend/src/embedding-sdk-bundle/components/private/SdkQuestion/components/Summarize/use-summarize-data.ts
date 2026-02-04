import { useCallback, useMemo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import {
  type AggregationItem,
  getAggregationItems,
} from "metabase/query_builder/utils/get-aggregation-items";
import * as Lib from "metabase-lib";

import { useSdkQuestionContext } from "../../context";

export interface SDKAggregationItem extends AggregationItem {
  onRemoveAggregation: () => void;
  onUpdateAggregation: (nextClause: Lib.Aggregable) => void;
}

export const useSummarizeData = () => {
  const { question, updateQuestion } = useSdkQuestionContext();
  const tc = useTranslateContent();

  const query = question?.query();
  const stageIndex = -1;

  const onQueryChange = useCallback(
    (newQuery: Lib.Query) => {
      if (question) {
        updateQuestion(question.setQuery(newQuery), { run: true });
      }
    },
    [question, updateQuestion],
  );

  const aggregationItems: SDKAggregationItem[] = useMemo(
    () =>
      query
        ? getAggregationItems({ query, stageIndex }).map((aggregationItem) => {
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
              displayName:
                PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(
                  aggregationItem.displayName,
                  tc,
                ),
              onRemoveAggregation,
              onUpdateAggregation,
            };
          })
        : [],
    [onQueryChange, query, stageIndex, tc],
  );

  return aggregationItems;
};
