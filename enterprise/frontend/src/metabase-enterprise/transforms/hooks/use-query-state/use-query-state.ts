import { useEffect, useMemo, useState } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  clearTransformQuery,
  getMetabotTransformQuery,
  getMetabotTransformQueryUpdateId,
} from "metabase-enterprise/metabot/state";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

export function useQueryState(initialQuery: DatasetQuery) {
  const [query, setQuery] = useState(initialQuery);
  const [lastProcessedUpdateId, setLastProcessedUpdateId] = useState<
    string | null
  >(null);

  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  // Subscribe to Metabot transform query updates
  const metabotTransformQuery = useSelector(
    getMetabotTransformQuery as any,
  ) as ReturnType<typeof getMetabotTransformQuery>;
  const metabotUpdateId = useSelector(
    getMetabotTransformQueryUpdateId as any,
  ) as ReturnType<typeof getMetabotTransformQueryUpdateId>;

  // Handle Metabot query updates
  useEffect(() => {
    if (
      metabotTransformQuery &&
      metabotUpdateId &&
      metabotUpdateId !== lastProcessedUpdateId
    ) {
      setQuery(metabotTransformQuery);
      setLastProcessedUpdateId(metabotUpdateId);
    }
  }, [metabotTransformQuery, metabotUpdateId, lastProcessedUpdateId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      dispatch(clearTransformQuery());
    };
  }, [dispatch]);

  const question = useMemo(
    () => Question.create({ dataset_query: query, metadata }),
    [query, metadata],
  );

  const isQueryDirty = useMemo(
    () => !Lib.areLegacyQueriesEqual(query, initialQuery),
    [query, initialQuery],
  );

  const setQuestion = (newQuestion: Question) => {
    setQuery(newQuestion.datasetQuery());
  };

  return { question, isQueryDirty, setQuestion };
}
