import { createContext, useContext, useEffect, useMemo } from "react";

import { StaticQuestionSdkMode } from "embedding-sdk/components/public/StaticQuestion/mode";
import { useLoadQuestion } from "embedding-sdk/hooks/private/use-load-question";
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { EntityTypeFilterKeys } from "embedding-sdk/types/question";
import type { DataPickerValue } from "metabase/common/components/DataPicker";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { setEntityTypes } from "metabase/redux/embedding-data-picker";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import type {
  InteractiveQuestionContextType,
  InteractiveQuestionProviderProps,
} from "./types";

/**
 * Note: This context should only be used as a wrapper for the InteractiveQuestionDefaultView
 * component. The idea behind this context is to allow the InteractiveQuestionDefaultView component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

const DEFAULT_OPTIONS = {};

const FILTER_MODEL_MAP: Record<EntityTypeFilterKeys, DataPickerValue["model"]> =
  {
    table: "table",
    question: "card",
    model: "dataset",
    metric: "metric",
  };
const mapEntityTypeFilterToDataPickerModels = (
  entityTypes: InteractiveQuestionProviderProps["entityTypes"],
): InteractiveQuestionContextType["modelsFilterList"] => {
  return entityTypes?.map((entityType) => FILTER_MODEL_MAP[entityType]);
};

export const InteractiveQuestionProvider = ({
  questionId,
  options = DEFAULT_OPTIONS,
  deserializedCard,
  componentPlugins,
  onNavigateBack,
  children,
  onBeforeSave,
  onSave,
  isSaveEnabled = true,
  entityTypes,
  targetCollection,
  initialSqlParameters,
  withDownloads,
  variant,
}: InteractiveQuestionProviderProps) => {
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

  const questionContext: InteractiveQuestionContextType = {
    originalId: questionId,
    isQuestionLoading: isQuestionLoading,
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
    modelsFilterList: mapEntityTypeFilterToDataPickerModels(entityTypes),
    isSaveEnabled,
    targetCollection,
    withDownloads,
    variant,
  };

  useEffect(() => {
    loadAndQueryQuestion();
  }, [loadAndQueryQuestion]);

  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(setEntityTypes(entityTypes));
  }, [dispatch, entityTypes]);

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
