import { useEffect, useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery, VisualizationSettings } from "metabase-types/api";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useQueryState(
  initialQuery: DatasetQuery,
  proposedQuery?: DatasetQuery,
) {
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  const metadata = useSelector(getMetadata);

  const question = useMemo(
    () =>
      Question.create({
        dataset_query: query,
        metadata,
        visualization_settings: DEFAULT_VIZ_SETTINGS,
      }),
    [query, metadata],
  );

  const proposedQuestion = useMemo(() => {
    if (!proposedQuery) {
      return undefined;
    }

    const question = Question.create({
      dataset_query: proposedQuery,
      metadata,
    });
    const { isNative } = Lib.queryDisplayInfo(question.query());

    if (isNative) {
      const nativeQuery = question.legacyNativeQuery();
      if (nativeQuery) {
        const queryText = nativeQuery.queryText();
        // For native queries, ensure template tags are processed
        const updatedQuery = nativeQuery.setQueryText(queryText);
        return updatedQuery.question();
      }
    }

    return question;
  }, [proposedQuery, metadata]);

  const isQueryDirty = useMemo(
    () => !Lib.areLegacyQueriesEqual(query, initialQuery),
    [query, initialQuery],
  );

  const setQuestion = (newQuestion: Question) => {
    setQuery(newQuestion.datasetQuery());
  };

  return { question, proposedQuestion, isQueryDirty, setQuestion };
}
