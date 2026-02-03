import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkInternalNavigationOptional } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { SdkQuestionAlertListModal } from "embedding-sdk-bundle/components/private/notifications/SdkQuestionAlertListModal";
import { QuestionAlertModalProvider } from "embedding-sdk-bundle/components/private/notifications/context/QuestionAlertModalProvider";
import { useExtractResourceIdFromJwtToken } from "embedding-sdk-bundle/hooks/private/use-extract-resource-id-from-jwt-token";
import { useLoadQuestion } from "embedding-sdk-bundle/hooks/private/use-load-question";
import { useSetupContentTranslations } from "embedding-sdk-bundle/hooks/private/use-setup-content-translations";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import {
  getError,
  getIsGuestEmbed,
  getPlugins,
} from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import {
  type OnCreateOptions,
  useCreateQuestion,
} from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { setEntityTypes } from "metabase/redux/embedding-data-picker";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
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
  questionId: rawQuestionId,
  token: rawToken,
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
  withAlerts,
  targetDashboardId,
  backToDashboard,
  getClickActionMode: userGetClickActionMode,
  navigateToNewCard: userNavigateToNewCard,
  onVisualizationChange,
}: SdkQuestionProviderProps) => {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);
  const navigation = useSdkInternalNavigationOptional();

  const {
    resourceId: questionId,
    token,
    tokenError,
  } = useExtractResourceIdFromJwtToken({
    isGuestEmbed,
    resourceId: rawQuestionId,
    token: rawToken ?? undefined,
  });

  useSetupContentTranslations({ token });

  const isNewQuestion = questionId === "new" || questionId === "new-native";

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
    isGuestEmbed,
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
          queryMode: EmbeddingSdkMode,
          plugins: plugins as InternalMetabasePluginsConfig,
        })
      );
    });

  const mode = (question && getClickActionMode({ question })) ?? null;

  // Wrap navigateToNewCard to use virtual entry pattern (like dashboards)
  // This keeps the question mounted while drill results are shown
  const navigateToNewCardWithSdkInternalNavigation = useCallback(
    async (params: Parameters<NonNullable<typeof navigateToNewCard>>[0]) => {
      // Use internal navigation (keeps question mounted, updates state internally)
      await navigateToNewCard?.(params);
      // Only push virtual entry if last entry is NOT already a question drill
      // (prevents stacking multiple entries on consecutive drills from the same question)
      const currentEntry = navigation?.stack.at(-1);
      if (currentEntry?.type !== "virtual-question-drill") {
        navigation?.push({
          type: "virtual-question-drill",
          name: question?.displayName() ?? t`Question`,
          onPop: () => loadAndQueryQuestion(),
        });
      }
    },
    [navigateToNewCard, navigation, question, loadAndQueryQuestion],
  );

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
      userNavigateToNewCard === undefined
        ? navigateToNewCardWithSdkInternalNavigation
        : userNavigateToNewCard,
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
    withAlerts,
    onRun,
    backToDashboard,
    hiddenParameters,
    onVisualizationChange,
  };

  useEffect(() => {
    if (tokenError) {
      return;
    }

    loadAndQueryQuestion();
  }, [loadAndQueryQuestion, tokenError]);

  // Push question to navigation stack once loaded (similar to dashboard init)
  // Only if stack is empty (i.e., this is the root question, not navigated to)
  useEffect(() => {
    if (
      question &&
      !!questionId &&
      navigation &&
      navigation.stack.length === 0
    ) {
      navigation.push({
        type: "question",
        id: questionId,
        name: question.displayName() || t`Question`,
      });
    }
    // Only run when question is first loaded
  }, [questionId, question, navigation]);

  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(setEntityTypes(entityTypes));
  }, [dispatch, entityTypes]);

  if (isGuestEmbed && isNewQuestion) {
    return (
      <SdkError
        message={t`You can't explore or save questions in Guest Embed mode`}
      />
    );
  }

  if (tokenError) {
    return <SdkError message={tokenError} />;
  }

  if (error) {
    return <SdkError message={error.message} />;
  }

  return (
    <SdkQuestionContext.Provider value={questionContext}>
      <EmbeddingEntityContextProvider uuid={null} token={token}>
        <QuestionAlertModalProvider>
          {children}
          <SdkQuestionAlertListModal />
        </QuestionAlertModalProvider>
      </EmbeddingEntityContextProvider>
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
