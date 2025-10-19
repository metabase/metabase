import { createContext, useContext, useEffect, useMemo } from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useLoadQuestion } from "embedding-sdk-bundle/hooks/private/use-load-question";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import {
  getError,
  getIsStaticEmbedding,
  getPlugins,
} from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import {
  type OnCreateOptions,
  useCreateQuestion,
} from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { setEntityTypes } from "metabase/redux/embedding-data-picker";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import type { SdkQuestionContextType, SdkQuestionProviderProps } from "./types";

/**
 * Note: This context should only be used as a wrapper for the SdkQuestionDefaultView
 * component. The idea behind this context is to allow the SdkQuestionDefaultView component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const SdkQuestionContext = createContext<
  SdkQuestionContextType | undefined
>(undefined);

const DEFAULT_OPTIONS = {};

export const SdkQuestionProvider = ({
  questionId,
  token,
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
  hiddenParameters,
  withDownloads,
  targetDashboardId,
  backToDashboard,
  getClickActionMode: userGetClickActionMode,
  navigateToNewCard: userNavigateToNewCard,
  onVisualizationChange,
}: SdkQuestionProviderProps) => {
  const isStaticEmbedding = useSdkSelector(getIsStaticEmbedding);
  const error = useSdkSelector(getError);

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

  const handleCreate = async (
    question: Question,
    options?: OnCreateOptions,
  ): Promise<Question> => {
    if (isSaveEnabled) {
      const saveContext = {
        isNewQuestion: true,
        dashboardTabId: options?.dashboardTabId,
      };
      const sdkQuestion = transformSdkQuestion(question);

      await onBeforeSave?.(sdkQuestion, saveContext);

      const createdQuestion = await handleCreateQuestion(question, options);
      onSave?.(transformSdkQuestion(createdQuestion), saveContext);

      // Set the latest saved question object to update the question title.
      replaceQuestion(createdQuestion);
      return createdQuestion;
    }

    return question;
  };

  const {
    question,
    originalQuestion,
    parameterValues,

    queryResults,

    isQuestionLoading,
    isQueryRunning,

    queryQuestion,
    replaceQuestion,
    loadAndQueryQuestion,
    updateQuestion,
    updateParameterValues,
    navigateToNewCard,
  } = useLoadQuestion({
    questionId,
    token,
    options,
    deserializedCard,
    initialSqlParameters,
    targetDashboardId,
  });

  const globalPlugins = useSdkSelector(getPlugins);

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...componentPlugins };
  }, [globalPlugins, componentPlugins]);

  const getClickActionMode: ClickActionModeGetter =
    userGetClickActionMode ??
    (({ question }: { question: Question }) => {
      return (
        question &&
        getEmbeddingMode({
          question,
          isStaticEmbedding,
          plugins: plugins as InternalMetabasePluginsConfig,
        })
      );
    });

  const mode = (question && getClickActionMode({ question })) ?? null;

  const questionContext: SdkQuestionContextType = {
    originalId: questionId,
    token,
    isQuestionLoading,
    isQueryRunning,
    resetQuestion: loadAndQueryQuestion,
    onReset: loadAndQueryQuestion,
    onNavigateBack,
    queryQuestion,
    replaceQuestion,
    updateQuestion,
    updateParameterValues,
    navigateToNewCard:
      userNavigateToNewCard !== undefined
        ? userNavigateToNewCard
        : navigateToNewCard,
    plugins,
    question,
    originalQuestion,
    parameterValues,
    queryResults,
    mode,
    onSave: handleSave,
    onCreate: handleCreate,
    isSaveEnabled,
    targetCollection,
    withDownloads,
    onRun,
    backToDashboard,
    hiddenParameters,
    onVisualizationChange,
  };

  useEffect(() => {
    loadAndQueryQuestion();
  }, [loadAndQueryQuestion]);

  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(setEntityTypes(entityTypes));
  }, [dispatch, entityTypes]);

  if (error) {
    return <SdkError message={error.message} />;
  }

  return (
    <SdkQuestionContext.Provider value={questionContext}>
      {children}
    </SdkQuestionContext.Provider>
  );
};

export const useSdkQuestionContext = () => {
  const context = useContext(SdkQuestionContext);
  if (context === undefined) {
    throw new Error(
      "useSdkQuestionContext must be used within a SdkQuestionProvider",
    );
  }
  return context;
};
