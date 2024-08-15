import {
  createContext,
  useContext,
  type PropsWithChildren,
  useMemo,
} from "react";
import { useMount } from "react-use";

import type { SdkPluginsConfig } from "embedding-sdk";
import {
  useLoadQuestion,
  type LoadQuestionHookResult,
} from "embedding-sdk/hooks/private/use-load-question";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import type { QueryParams } from "metabase/query_builder/actions";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

interface InteractiveQuestionContextType
  extends Omit<LoadQuestionHookResult, "loadQuestion"> {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
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
  {
    componentPlugins?: SdkPluginsConfig;
    onReset?: () => void;
    onNavigateBack?: () => void;
  } & LoadSdkQuestionParams
>;

export const InteractiveQuestionProvider = ({
  cardId,
  options = {},
  deserializedCard,
  componentPlugins,
  onReset,
  onNavigateBack,
  children,
}: Omit<InteractiveQuestionProviderProps, "options"> & {
  options?: QueryParams;
}) => {
  const {
    question,
    originalQuestion,

    queryResults,

    isQuestionLoading,
    isQueryRunning,

    runQuestion,
    loadQuestion,
    updateQuestion,
    navigateToNewCard,
  } = useLoadQuestion({
    cardId,
    options,
    deserializedCard,
  });

  const globalPlugins = useSdkSelector(getPlugins);

  const combinedPlugins = useMemo(() => {
    return { ...globalPlugins, ...componentPlugins };
  }, [globalPlugins, componentPlugins]);

  const mode = useMemo(() => {
    return question && getEmbeddingMode(question, combinedPlugins ?? undefined);
  }, [question, combinedPlugins]);

  const questionContext: InteractiveQuestionContextType = {
    isQuestionLoading,
    isQueryRunning,
    resetQuestion: loadQuestion,
    onReset: onReset || loadQuestion,
    onNavigateBack,
    runQuestion,
    updateQuestion,
    navigateToNewCard,
    plugins: combinedPlugins,
    question,
    originalQuestion,
    queryResults,
    mode,
  };

  useMount(() => {
    loadQuestion();
  });

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
