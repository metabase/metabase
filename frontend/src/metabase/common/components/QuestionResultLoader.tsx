import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Deferred } from "metabase/lib/promise";
import { defer } from "metabase/lib/promise";
import { runQuestionQuery } from "metabase/services";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

export type QuestionResultLoaderChildState = {
  results: Dataset[] | null;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  loading: boolean;
  error: unknown;
  cancel: () => void;
  reload: () => void;
};

type QuestionResultLoaderProps = {
  question: Question | null | undefined;
  onLoad?: (results: Dataset[]) => void;
  keepPreviousWhileLoading?: boolean;
  collectionPreview?: boolean;
  children: (state: QuestionResultLoaderChildState) => ReactNode;
};

/*
 * Question result loader
 *
 * Handle running, canceling, and reloading Question results
 *
 * @example
 * <QuestionResultLoader question={question}>
 * { ({ result, cancel, reload }) =>
 *     <div>
 *       { result && (<Visualization ... />) }
 *
 *       <a onClick={() => reload()}>Reload this please</a>
 *       <a onClick={() => cancel()}>Changed my mind</a>
 *     </div>
 * }
 * </QuestionResultLoader>
 *
 */
export function QuestionResultLoader({
  question,
  onLoad,
  keepPreviousWhileLoading = false,
  collectionPreview,
  children,
}: QuestionResultLoaderProps) {
  const [results, setResults] = useState<Dataset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const cancelDeferredRef = useRef<Deferred | null>(null);
  const questionRef = useRef<Question | null | undefined>(question);

  const loadResult = useCallback(
    async (
      questionToLoad: Question | null | undefined,
      onLoadCallback?: (results: Dataset[]) => void,
      keepPrevious?: boolean,
    ) => {
      if (!questionToLoad) {
        setLoading(false);
        setResults(null);
        setError(null);
        return;
      }

      try {
        cancelDeferredRef.current = defer();

        setLoading(true);
        setResults((prev) => (keepPrevious ? prev : null));
        setError(null);

        const queryResults = await runQuestionQuery(questionToLoad, {
          cancelDeferred: cancelDeferredRef.current,
          collectionPreview,
        });

        setLoading(false);
        setResults(queryResults);

        if (onLoadCallback) {
          setTimeout(() => onLoadCallback(queryResults));
        }
      } catch (err) {
        setLoading(false);
        setError(err);
      }
    },
    [collectionPreview],
  );

  // A function to pass to the child to allow the component to call `loadResult` again
  const reload = useCallback(() => {
    loadResult(questionRef.current, onLoad, keepPreviousWhileLoading);
  }, [loadResult, onLoad, keepPreviousWhileLoading]);

  // A function to pass to the child to allow the component to interrupt the query
  const cancel = useCallback(() => {
    if (loading) {
      setLoading(false);
      cancelDeferredRef.current?.resolve();
    }
  }, [loading]);

  // Initial load on mount
  useEffect(() => {
    loadResult(question, onLoad, keepPreviousWhileLoading);
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when question changes
  useEffect(() => {
    const prevQuestion = questionRef.current;
    questionRef.current = question;

    if (question && prevQuestion && !question.isEqual(prevQuestion)) {
      loadResult(question, onLoad, keepPreviousWhileLoading);
    }
  }, [question, onLoad, keepPreviousWhileLoading, loadResult]);

  const result = results?.[0] ?? null;
  // convenience for <Visualization /> component. Only support single series for now
  const rawSeries: RawSeries | null =
    question && results
      ? [{ card: question.card(), data: results[0].data }]
      : null;

  return (
    children({
      results,
      result,
      rawSeries,
      loading,
      error,
      cancel,
      reload,
    }) ?? null
  );
}
