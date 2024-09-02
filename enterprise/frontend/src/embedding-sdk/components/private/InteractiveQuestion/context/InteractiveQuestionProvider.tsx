import { createContext, useContext, useEffect, useMemo } from "react";

import { useLoadQuestion } from "embedding-sdk/hooks/private/use-load-question";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { CardEntityId, CardId } from "metabase-types/api";

import type {
  InteractiveQuestionContextType,
  InteractiveQuestionProviderProps,
} from "./types";

/**
 * Note: This context should only be used as a wrapper for the InteractiveQuestionResult
 * component. The idea behind this context is to allow the InteractiveQuestionResult component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

const DEFAULT_OPTIONS = {};

export const InteractiveQuestionProvider = ({
  cardId: initId,
  options = DEFAULT_OPTIONS,
  deserializedCard,
  componentPlugins,
  onNavigateBack,
  children,
}: Omit<InteractiveQuestionProviderProps, "cardId"> & {
  cardId?: CardId | CardEntityId;
}) => {
  const { id: cardId, isLoading: isLoadingValidatedId } = useValidatedEntityId({
    type: "card",
    id: initId,
  });

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
    isQuestionLoading: isQuestionLoading || isLoadingValidatedId,
    isQueryRunning,
    resetQuestion: loadQuestion,
    onReset: loadQuestion,
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
