import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import { loadSdkQuestion } from "embedding-sdk/lib/load-question";
import {
  runQuestionOnQueryChangeSdk,
  runQuestionQueryOnNavigateSdk,
} from "embedding-sdk/lib/run-question-query";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type {
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type Question from "metabase-lib/v1/Question";

interface InteractiveQuestionContextType extends SdkQuestionResult {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  isQuestionLoading: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
  onQuestionChange: (question: Question) => void;
  onNavigateToNewCard: (params: NavigateToNewCardParams) => void;
}

/**
 * Note: This context should only be used as a wrapper for the InteractiveQuestionResult
 * component. The idea behind this context is to allow the InteractiveQuestionResult component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

type InteractiveQuestionProviderProps = PropsWithChildren<{
  questionId: number;
  componentPlugins?: SdkPluginsConfig;
  onReset?: () => void;
  onNavigateBack?: () => void;
}>;

export const InteractiveQuestionProvider = ({
  questionId,
  children,
  componentPlugins,
  onReset,
  onNavigateBack,
}: InteractiveQuestionProviderProps) => {
  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const { question, queryResults } = result;

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      const result = await dispatch(loadSdkQuestion(questionId));
      setQuestionResult(result);
    } catch (e) {
      console.error(`Failed to get question`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  }, [dispatch, questionId]);

  const globalPlugins = useSdkSelector(getPlugins);
  const plugins = componentPlugins || globalPlugins;

  const mode = question && getEmbeddingMode(question, plugins ?? undefined);

  async function onQuestionChange(nextQuestion: Question) {
    if (!question) {
      return;
    }

    // TODO: to remove log
    // eslint-disable-next-line no-console
    console.log("On Question Change:", { question });

    setIsQuestionLoading(true);

    try {
      const result = await dispatch(
        runQuestionOnQueryChangeSdk(question, nextQuestion),
      );

      setQuestionResult(result);
    } finally {
      setIsQuestionLoading(false);
    }
  }

  async function onNavigateToNewCard(params: NavigateToNewCardParams) {
    setIsQuestionLoading(true);

    try {
      const result = await dispatch(runQuestionQueryOnNavigateSdk(params));

      // TODO: to remove log
      // eslint-disable-next-line no-console
      console.log("On Navigate:", { question });

      if (result) {
        setQuestionResult(result);
      }
    } finally {
      setIsQuestionLoading(false);
    }
  }

  const questionContext: InteractiveQuestionContextType = {
    isQuestionLoading,
    resetQuestion: loadQuestion,
    onReset: onReset || loadQuestion,
    onNavigateBack,
    onQuestionChange,
    onNavigateToNewCard,
    mode,
    plugins,
    question,
    queryResults,
  };

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  return (
    <InteractiveQuestionContext.Provider value={questionContext}>
      {children}
    </InteractiveQuestionContext.Provider>
  );
};

export const useInteractiveQuestionContext = () => {
  const context = useContext(InteractiveQuestionContext);
  if (context === undefined) {
    throw new Error(
      "useInteractiveQuestionContext must be used within a InteractiveQuestionProvider",
    );
  }
  return context;
};
