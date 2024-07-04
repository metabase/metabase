import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import { updateQuestion } from "embedding-sdk/lib/update-question";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type * as Lib from "metabase-lib";

import { type UseLoadQuestionParams, useLoadQuestion } from "./hooks";

interface InteractiveQuestionContextType extends SdkQuestionResult {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  isQuestionLoading: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
  onQueryChange: (query: Lib.Query) => void;
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

type InteractiveQuestionProviderProps = PropsWithChildren<
  UseLoadQuestionParams & {
    componentPlugins?: SdkPluginsConfig;
    onReset?: () => void;
    onNavigateBack?: () => void;
  }
>;

export const InteractiveQuestionProvider = ({
  questionId,
  children,
  componentPlugins,
  onReset,
  onNavigateBack,
}: InteractiveQuestionProviderProps) => {
  const dispatch = useDispatch();

  const {
    card,
    question,
    queryResults,

    setQuestion,
    loadQuestion,
    isQuestionLoading,
  } = useLoadQuestion({ questionId });

  const globalPlugins = useSdkSelector(getPlugins);
  const plugins = componentPlugins || globalPlugins;

  const mode = useMemo(
    () => question && getEmbeddingMode(question, plugins || undefined),
    [plugins, question],
  );

  const onQueryChange = async (query: Lib.Query) => {
    if (!question) {
      return;
    }

    const nextQuestion = await updateQuestion({ query, question, dispatch });
    if (!nextQuestion) {
      return;
    }

    setQuestion(nextQuestion);

    await loadQuestion();
  };

  const questionContext: InteractiveQuestionContextType = {
    isQuestionLoading,
    resetQuestion: loadQuestion,
    onReset: onReset || loadQuestion,
    onNavigateBack,
    onQueryChange,
    mode,
    plugins,
    card,
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
