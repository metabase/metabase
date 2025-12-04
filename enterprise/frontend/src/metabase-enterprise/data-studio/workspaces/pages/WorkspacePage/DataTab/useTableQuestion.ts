import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useLazyGetAdhocQueryMetadataQuery,
  useLazyGetAdhocQueryQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { DatabaseId, Dataset, TableId } from "metabase-types/api";

interface UseTableQuestionProps {
  databaseId: DatabaseId | null;
  tableId: TableId | null;
}

interface UseTableQuestionResult {
  question: Question | null;
  result: Dataset | null;
  isLoading: boolean;
  isRunning: boolean;
  error: unknown;
}

export function useTableQuestion({
  databaseId,
  tableId,
}: UseTableQuestionProps): UseTableQuestionResult {
  const metadata = useSelector(getMetadata);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<Dataset | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [fetchMetadata, { isLoading: isLoadingMetadata }] =
    useLazyGetAdhocQueryMetadataQuery();
  const [fetchQuery] = useLazyGetAdhocQueryQuery();

  const question = useMemo(() => {
    if (!databaseId || !tableId) {
      return null;
    }

    return Question.create({
      DEPRECATED_RAW_MBQL_databaseId: databaseId,
      DEPRECATED_RAW_MBQL_tableId: tableId,
      metadata,
      display: "table",
    });
  }, [databaseId, tableId, metadata]);

  const datasetQuery = useMemo(() => {
    if (!question) {
      return null;
    }
    return question.datasetQuery();
  }, [question]);

  const runQuery = useCallback(async () => {
    if (!datasetQuery) {
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      await fetchMetadata(datasetQuery).unwrap();

      const queryResult = await fetchQuery(datasetQuery).unwrap();
      setResult(queryResult);
    } catch (err) {
      setError(err);
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  }, [datasetQuery, fetchMetadata, fetchQuery]);

  useEffect(() => {
    if (databaseId && tableId && datasetQuery) {
      runQuery();
    } else {
      setResult(null);
      setError(null);
    }
    // We intentionally only want to run when databaseId or tableId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, tableId]);

  return {
    question,
    result,
    isLoading: isLoadingMetadata,
    isRunning,
    error,
  };
}
