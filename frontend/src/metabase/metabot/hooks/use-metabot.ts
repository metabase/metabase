import { useCallback, useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { Dataset, MetabotFeedbackType } from "metabase-types/api";
import Question from "metabase-lib/Question";

interface UseMetabotProps {
  initialQueryText?: string;
  onFetchQuestion: (query: string) => Promise<Question>;
}

interface UseMetabotResult {
  question?: Question;
  results?: [Dataset];
  isLoading: boolean;
  error?: unknown;
  feedbackType?: MetabotFeedbackType;
  isFeedbackSubmitted: boolean;
  handleTextQuerySubmit: (query: string) => void;
  handleNativeQuerySubmit: (question: Question) => void;
  handleFeedbackChange: (feedbackType?: MetabotFeedbackType) => void;
  handleFeedbackSubmit: (feedbackMessage: string) => void;
}

const useMetabot = ({
  initialQueryText = "",
  onFetchQuestion,
}: UseMetabotProps): UseMetabotResult => {
  const [question, setQuestion] = useState<Question>();
  const [feedbackType, setFeedbackType] = useState<MetabotFeedbackType>();
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [questionState, loadQuestion] = useAsyncFn(onFetchQuestion);
  const [resultState, loadResults] = useAsyncFn(fetchResults);

  const handleTextQuerySubmit = useCallback(
    (queryText: string) => {
      setQuestion(undefined);
      loadQuestion(queryText).then(loadResults);
    },
    [loadQuestion, loadResults],
  );

  const handleNativeQuerySubmit = useCallback(
    (question: Question) => {
      setQuestion(question);
      setIsFeedbackSubmitted(true);
      loadResults(question);
    },
    [loadResults],
  );

  useEffect(() => {
    if (initialQueryText) {
      handleTextQuerySubmit(initialQueryText);
    }
  }, [initialQueryText, handleTextQuerySubmit]);

  return {
    question: question ?? questionState.value,
    results: resultState.value,
    isLoading: questionState.loading || resultState.loading,
    error: questionState.error ?? resultState.error,
    feedbackType,
    isFeedbackSubmitted,
    handleTextQuerySubmit,
    handleNativeQuerySubmit: handleNativeQuerySubmit,
    handleFeedbackChange: setFeedbackType,
    handleFeedbackSubmit: () => undefined,
  };
};

const fetchResults = async (question: Question) => {
  return question.apiGetResults();
};

export default useMetabot;
