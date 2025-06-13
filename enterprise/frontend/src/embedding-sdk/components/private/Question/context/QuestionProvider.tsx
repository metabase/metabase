import { createContext, useContext, useEffect, useMemo } from "react";

import { StaticQuestionSdkMode } from "embedding-sdk/components/public/Question/modes/static";
import { useLoadQuestion } from "embedding-sdk/hooks/private/use-load-question";
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { setEntityTypes } from "metabase/redux/embedding-data-picker";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import type { QuestionContextType, QuestionProviderProps } from "./types";

/**
 * Note: This context should only be used as a wrapper for the QuestionDefaultView
 * component. The idea behind this context is to allow the QuestionDefaultView component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const QuestionContext = createContext<QuestionContextType | undefined>(
  undefined,
);

const DEFAULT_OPTIONS = {};

export const QuestionProvider = ({
  questionId,
  options = DEFAULT_OPTIONS,
  deserializedCard,
  componentPlugins,
  onNavigateBack,
  children,
  onBeforeSave,
  onSave,
  onRun,
  isSaveEnabled = true,
  entityTypes,
  targetCollection,
  initialSqlParameters,
  withDownloads,
  variant,
}: QuestionProviderProps) => {
  const handleCreateQuestion = useCreateQuestion();
  const handleSaveQuestion = useSaveQuestion();

  const handleSave = async (question: Question) => {
    if (isSaveEnabled) {
      const saveContext = { isNewQuestion: false };
      const sdkQuestion = transformSdkQuestion(question);

      await onBeforeSave?.(sdkQuestion, saveContext);
      await handleSaveQuestion(question);
      onSave?.(sdkQuestion, saveContext);
      await loadAndQueryQuestion();
    }
  };

  const handleCreate = async (question: Question): Promise<Question> => {
    if (isSaveEnabled) {
      const saveContext = { isNewQuestion: true };
      const sdkQuestion = transformSdkQuestion(question);

      await onBeforeSave?.(sdkQuestion, saveContext);

      const createdQuestion = await handleCreateQuestion(question);
      onSave?.(sdkQuestion, saveContext);

      // Set the latest saved question object to update the question title.
      replaceQuestion(createdQuestion);
      return createdQuestion;
    }

    return question;
  };

  const {
    question,
    originalQuestion,

    queryResults,

    isQuestionLoading,
    isQueryRunning,

    queryQuestion,
    replaceQuestion,
    loadAndQueryQuestion,
    updateQuestion,
    navigateToNewCard,
  } = useLoadQuestion({
    questionId,
    options,
    deserializedCard,
    initialSqlParameters,
  });

  const globalPlugins = useSdkSelector(getPlugins);

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...componentPlugins };
  }, [globalPlugins, componentPlugins]);

  const mode = useMemo(() => {
    return (
      question &&
      getEmbeddingMode({
        question,
        queryMode:
          variant === "static" ? StaticQuestionSdkMode : EmbeddingSdkMode,
        plugins: plugins as InternalMetabasePluginsConfig,
      })
    );
  }, [question, variant, plugins]);

  const questionContext: QuestionContextType = {
    originalId: questionId,
    isQuestionLoading,
    isQueryRunning,
    resetQuestion: loadAndQueryQuestion,
    onReset: loadAndQueryQuestion,
    onNavigateBack,
    queryQuestion,
    replaceQuestion,
    updateQuestion,
    navigateToNewCard,
    plugins,
    question,
    originalQuestion,
    queryResults,
    mode,
    onSave: handleSave,
    onCreate: handleCreate,
    isSaveEnabled,
    targetCollection,
    withDownloads,
    variant,
    onRun,
  };

  useEffect(() => {
    loadAndQueryQuestion();
  }, [loadAndQueryQuestion]);

  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(setEntityTypes(entityTypes));
  }, [dispatch, entityTypes]);

  return (
    <QuestionContext.Provider value={questionContext}>
      {children}
    </QuestionContext.Provider>
  );
};

export const useQuestionContext = () => {
  const context = useContext(QuestionContext);
  if (context === undefined) {
    throw new Error(
      "useQuestionContext must be used within a QuestionProvider",
    );
  }
  return context;
};
