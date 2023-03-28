import { useCallback, useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { Dataset, MetabotFeedbackType } from "metabase-types/api";
import Question from "metabase-lib/Question";

interface UseMetabotProps {
  initialQuery?: string;
  onFetchQuestion: (query: string) => Promise<Question>;
}

interface UseMetabotResult {
  query: string;
  feedbackType?: MetabotFeedbackType;
  question?: Question;
  results?: [Dataset];
  isLoading: boolean;
  error?: unknown;
  handleQueryChange: (query: string) => void;
  handleQuerySubmit: () => void;
  handleFeedbackTypeChange: (feedbackType?: MetabotFeedbackType) => void;
  handleFeedbackSubmit: (message: string) => void;
}

const useMetabot = ({
  initialQuery = "",
  onFetchQuestion,
}: UseMetabotProps): UseMetabotResult => {
  const [query, setQuery] = useState(initialQuery);
  const [feedbackType, setFeedbackType] = useState<MetabotFeedbackType>();
  const [questionState, loadQuestion] = useAsyncFn(onFetchQuestion);
  const [resultState, loadResults] = useAsyncFn(fetchResults);

  const handleQuerySubmit = useCallback(() => {
    loadQuestion(query).then(loadResults);
  }, [query, loadQuestion, loadResults]);

  useEffect(() => {
    if (initialQuery) {
      loadQuestion(initialQuery).then(loadResults);
    }
  }, [initialQuery, loadQuestion, loadResults]);

  return {
    query,
    feedbackType,
    question: questionState.value,
    results: resultState.value,
    isLoading: questionState.loading || resultState.loading,
    error: questionState.error ?? resultState.error,
    handleQueryChange: setQuery,
    handleQuerySubmit,
    handleFeedbackTypeChange: setFeedbackType,
    handleFeedbackSubmit: () => undefined,
  };
};

const fetchResults = async (question: Question) => {
  return question.apiGetResults();
};

export default useMetabot;
