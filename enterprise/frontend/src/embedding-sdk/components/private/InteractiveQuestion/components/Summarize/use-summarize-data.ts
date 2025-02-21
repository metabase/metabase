import { useCallback, useMemo } from "react";

import {
  type AggregationItem,
  getAggregationItems,
} from "metabase/query_builder/utils/get-aggregation-items";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../context";

export interface SDKAggregationItem extends AggregationItem {
  onRemoveAggregation: () => void;
  onUpdateAggregation: (nextClause: Lib.Aggregable) => void;
}

export const useSummarizeData = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

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
        ? getAggregationItems({ query, stageIndex }).map(aggregationItem => {
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
              onRemoveAggregation,
              onUpdateAggregation,
            };
          })
        : [],
    [onQueryChange, query, stageIndex],
  );

  return aggregationItems;
};
