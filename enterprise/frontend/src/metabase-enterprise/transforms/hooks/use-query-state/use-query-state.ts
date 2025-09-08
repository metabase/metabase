import { useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

export function useQueryState(
  initialQuery: DatasetQuery,
  proposedQuery?: DatasetQuery,
) {
  const [query, setQuery] = useState(initialQuery);
  const metadata = useSelector(getMetadata);

  const question = useMemo(
    () => Question.create({ dataset_query: query, metadata }),
    [query, metadata],
  );

  const proposedQuestion = useMemo(
    () =>
      proposedQuery
        ? Question.create({ dataset_query: proposedQuery, metadata })
        : undefined,
    [proposedQuery, metadata],
  );

  const isQueryDirty = useMemo(
    () => !Lib.areLegacyQueriesEqual(query, initialQuery),
    [query, initialQuery],
  );

  const setQuestion = (newQuestion: Question) => {
    setQuery(newQuestion.datasetQuery());
  };

  return { question, proposedQuestion, isQueryDirty, setQuestion };
}
