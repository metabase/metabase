import { useCallback, useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";

interface UseMetabotProps {
  initialQuery?: string;
  onFetchQuestion: (query: string) => Promise<Question>;
}

interface UseMetabotResult {
  question?: Question;
  results?: [Dataset];
  loading: boolean;
  error?: unknown;
  handleRun: (query: string) => void;
  handleRerun: (question: Question) => void;
}

const useMetabot = ({
  initialQuery,
  onFetchQuestion,
}: UseMetabotProps): UseMetabotResult => {
  const [question, setQuestion] = useState<Question>();
  const [questionState, loadQuestion] = useAsyncFn(onFetchQuestion);
  const [resultState, loadResults] = useAsyncFn(fetchResults);

  const handleRun = useCallback(
    (query: string) => {
      loadQuestion(query).then(loadResults);
    },
    [loadQuestion, loadResults],
  );

  const handleRerun = useCallback(
    (question: Question) => {
      setQuestion(question);
      loadResults(question);
    },
    [loadResults],
  );

  useEffect(() => {
    if (initialQuery) {
      handleRun(initialQuery);
    }
  }, [initialQuery, handleRun]);

  return {
    question: question ?? questionState.value,
    results: resultState.value,
    loading: questionState.loading || resultState.loading,
    error: questionState.error ?? resultState.error,
    handleRun,
    handleRerun,
  };
};

const fetchResults = async (question: Question) => {
  return question.apiGetResults();
};

export default useMetabot;
