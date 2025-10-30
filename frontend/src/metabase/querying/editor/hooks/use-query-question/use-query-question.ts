import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useQueryQuestion(
  query: Lib.Query,
  proposedQuery: Lib.Query | undefined,
  setQuery: (newQuery: Lib.Query) => void,
) {
  const metadata = useSelector(getMetadata);

  const { question, proposedQuestion } = useMemo(
    () => ({
      question: Question.create({
        dataset_query: Lib.toJsQuery(query),
        metadata,
        visualization_settings: DEFAULT_VIZ_SETTINGS,
      }),
      proposedQuestion:
        proposedQuery != null
          ? Question.create({
              dataset_query: Lib.toJsQuery(proposedQuery),
              metadata,
              visualization_settings: DEFAULT_VIZ_SETTINGS,
            })
          : undefined,
    }),
    [query, proposedQuery, metadata],
  );

  const setQuestion = (newQuestion: Question) => {
    setQuery(newQuestion.query());
  };

  return { question, proposedQuestion, setQuestion };
}
