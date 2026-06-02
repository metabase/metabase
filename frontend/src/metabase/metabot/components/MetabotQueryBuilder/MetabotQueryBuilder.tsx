import { useDisclosure } from "@mantine/hooks";
import { isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { AdHocQuestionLoader } from "metabase/common/components/AdHocQuestionLoader";
import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { QuestionResultLoader } from "metabase/common/components/QuestionResultLoader";
import { useSetting } from "metabase/common/hooks";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import {
  type FullscreenQuestion,
  MetabotQuestionFullscreenContext,
} from "metabase/metabot/components/MetabotChat/MetabotQuestionFullscreenContext";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import { useScrollManager } from "metabase/metabot/components/MetabotChat/hooks";
import { MetabotModelSelector } from "metabase/metabot/components/MetabotModelSelector";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { useDispatch, useSelector } from "metabase/redux";
import { useRouter } from "metabase/router";
import { getSettingsLoading } from "metabase/selectors/settings";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { TableSelectionMention } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, MetabotAdhocQueryInfo } from "metabase-types/api";

import {
  useMetabotAgent,
  usePromptInputFocusEffect,
  useUserMetabotPermissions,
} from "../../hooks";
import { type MetabotAgentId, rememberDataPointTarget } from "../../state";
import { AIProviderConfigurationNotice } from "../AIProviderConfigurationNotice";
import {
  type DataPointMentionTarget,
  getChartData,
  getClickedObjectFromDataPointTarget,
  getDataPointMention,
  getDataPointMentionEvent,
  getDataPointMentionEventId,
  getDataPointMentionMarkdown,
  getDataPointRangeMentionMarkdown,
  getDataPointTargetsFromState,
  getNextDataPointRangeMentionId,
  getSelectedChartData,
  getSelectedChartRange,
} from "../MetabotChat/data-point-mentions";

import S from "./MetabotQueryBuilder.module.css";

const defaultSuggestionModels = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
] as const;

const getTitleText = () => {
  return _.sample([
    t`What would you like to know?`,
    t`What do you want to explore?`,
    t`What are you looking to learn?`,
  ]);
};

const MetabotQueryBuilderInner = () => {
  const agentId: MetabotAgentId = "omnibot";
  const { canUseNlq } = useUserMetabotPermissions();
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);

  const {
    setVisible,
    resetConversation,
    metabotId,
    isDoingScience,
    messages,
    activeToolCalls,
    debugMode,
    requestState,
    isLongConversation,
    prompt,
    setPrompt,
    submitInput,
    retryMessage,
    cancelRequest,
    modelOverride,
    setModelOverride,
  } = useMetabotAgent(agentId);

  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  usePromptInputFocusEffect(
    agentId,
    useCallback(() => promptInputRef.current?.focus(), []),
  );
  const [title] = useState(getTitleText);
  const [hasError, setHasError] = useState(false);
  const [fullscreenQuestion, setFullscreenQuestion] =
    useState<FullscreenQuestion | null>(null);
  const showIllustrations = useSetting("metabot-show-illustrations");

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: 4,
    sample: true,
  });
  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;
  const suggestedPromptCount = suggestedPrompts?.length ?? 0;
  const hasMessages = messages.length > 0;
  const showConversation = hasMessages || isDoingScience;
  const { scrollContainerRef, headerRef, fillerRef } =
    useScrollManager(showConversation);

  const handleSubmitPrompt = async (prompt: string) => {
    const selectedModelOverride = modelOverride;
    if (!hasMessages) {
      // Start a fresh NLQ conversation for the first prompt from this page.
      resetConversation();
      // resetConversation clears the per-conversation model override, so
      // re-apply the user's selection to the new conversation.
      if (selectedModelOverride) {
        setModelOverride(selectedModelOverride);
      }
    }
    setHasError(false);

    const action = await submitInput(prompt, {
      profile: "nlq",
      preventOpenSidebar: true,
    });

    if (isRejected(action)) {
      return setHasError(true);
    }

    if (!action.payload.success) {
      if (action.payload.shouldRetry) {
        setPrompt(prompt);
      }
      return setHasError(true);
    }
  };

  const handleEditorSubmit = () => handleSubmitPrompt(prompt);

  const inputDisabled = prompt.trim().length === 0 || isDoingScience;

  useEffect(
    function autoCloseMetabotOnMount() {
      setVisible(false);
    },
    [setVisible],
  );

  const { router, routes } = useRouter();
  const dataPointTargets = getDataPointTargetsFromState(requestState);
  const currentRoute = routes.at(-1);
  useEffect(
    function cancelRequestOnRouteLeave() {
      return router.setRouteLeaveHook(currentRoute, () => {
        if (isDoingScience) {
          cancelRequest();
          resetConversation(); // clear any partial response and reset profile
        }
        return true;
      });
    },
    [router, currentRoute, cancelRequest, resetConversation, isDoingScience],
  );

  const promptInput = (
    <Paper
      className={cx(
        S.inputContainer,
        isDoingScience && S.inputContainerLoading,
      )}
    >
      <Box className={S.editorWrapper}>
        {!canUseNlq ? (
          <AIProviderConfigurationNotice
            py="0.5rem"
            featureName={t`AI exploration`}
            inline
            onConfigureAi={openAiProviderConfigurationModal}
          />
        ) : (
          <MetabotPromptInput
            ref={promptInputRef}
            value={prompt}
            autoFocus
            disabled={isDoingScience}
            placeholder={t`Ask about your data, and type @ to mention an item`}
            onChange={setPrompt}
            onSubmit={handleEditorSubmit}
            onStop={cancelRequest}
            suggestionConfig={{
              suggestionModels: [...defaultSuggestionModels],
            }}
          />
        )}
      </Box>
      <Box className={S.inputActions}>
        <Box className={S.inputActionsLeft}>
          {hasError && (
            <Text c="error" ta="center">
              {t`Something went wrong. Please try again.`}
            </Text>
          )}
        </Box>
        <Box className={S.inputActionsRight}>
          {canUseNlq && (
            <MetabotModelSelector
              disabled={isDoingScience}
              modelOverride={modelOverride}
              onModelOverrideChange={setModelOverride}
            />
          )}
          <ActionIcon
            className={S.sendButton}
            variant="filled"
            size="2rem"
            disabled={!canUseNlq || inputDisabled}
            loading={isDoingScience}
            onClick={handleEditorSubmit}
            data-testid="metabot-send-message"
            aria-label={t`Send`}
          >
            <Icon name="arrow_up" />
          </ActionIcon>
        </Box>
      </Box>
    </Paper>
  );

  return (
    <MetabotQuestionFullscreenContext.Provider
      value={{
        fullscreenQuestion,
        openFullscreenQuestion: setFullscreenQuestion,
        closeFullscreenQuestion: () => setFullscreenQuestion(null),
      }}
    >
      <Box className={cx(S.page, fullscreenQuestion && S.pageFullscreen)}>
        {showConversation ? (
          <Box
            className={cx(
              S.conversationContainer,
              fullscreenQuestion && S.conversationContainerSplit,
            )}
          >
            <Box ref={headerRef} className={S.conversationHeader}>
              <Text fz="sm" c="text-secondary">
                {t`Metabot isn't perfect. Double-check results.`}
              </Text>
            </Box>
            <Box
              ref={scrollContainerRef}
              className={S.messagesContainer}
              data-testid="metabot-query-builder-chat-messages"
            >
              <Box className={S.messages}>
                <Messages
                  agentId={agentId}
                  messages={messages}
                  onRetryMessage={retryMessage}
                  isDoingScience={isDoingScience}
                  debug={debugMode}
                  dataPointTargets={dataPointTargets}
                />
                {isDoingScience && (
                  <MetabotThinking toolCalls={activeToolCalls} />
                )}
                <div
                  ref={fillerRef}
                  className={S.messageFiller}
                  data-testid="metabot-message-filler"
                />
                {isLongConversation && (
                  <MetabotResetLongChatButton
                    onResetConversation={resetConversation}
                  />
                )}
              </Box>
            </Box>
            <Box className={S.bottomInputContainer}>{promptInput}</Box>
          </Box>
        ) : (
          <Box className={S.centeredContainer}>
            <Box className={S.greeting}>
              {showIllustrations && <MetabotLogo className={S.greetingIcon} />}
              <Text fz={{ base: "xl", sm: 32 }} fw={600} c="text-primary">
                {title}
              </Text>
            </Box>

            <Stack gap="lg" className={S.inputWrapper}>
              {promptInput}

              <Box className={S.promptSuggestionsContainer}>
                {canUseNlq
                  ? suggestedPrompts?.map(
                      ({ prompt: suggestedPrompt }, index) => (
                        <UnstyledButton
                          key={index}
                          className={cx(S.promptSuggestion, {
                            [S.promptSuggestionShow]: !isDoingScience,
                            [S.promptSuggestionHide]: isDoingScience,
                          })}
                          style={{
                            animationDelay: isDoingScience
                              ? `${(suggestedPromptCount - index - 1) * 50}ms`
                              : `${index * 75}ms`,
                          }}
                          onClick={() => handleSubmitPrompt(suggestedPrompt)}
                          disabled={isDoingScience}
                        >
                          <Text>{suggestedPrompt}</Text>
                        </UnstyledButton>
                      ),
                    )
                  : null}
              </Box>
            </Stack>
          </Box>
        )}
        {fullscreenQuestion && (
          <FullscreenQuestionPanel
            agentId={agentId}
            question={fullscreenQuestion}
            dataPointTargets={dataPointTargets}
            onClose={() => setFullscreenQuestion(null)}
          />
        )}
        <AIProviderConfigurationModal
          opened={isAiProviderConfigurationModalOpen}
          onClose={closeAiProviderConfigurationModal}
        />
      </Box>
    </MetabotQuestionFullscreenContext.Provider>
  );
};

const FullscreenQuestionPanel = ({
  agentId,
  question,
  dataPointTargets,
  onClose,
}: {
  agentId: MetabotAgentId;
  question: FullscreenQuestion;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  onClose: () => void;
}) => {
  const { prompt, setPrompt, focusPromptInput } = useMetabotAgent(agentId);
  const dispatch = useDispatch();
  const panelRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<Question | null>(null);
  const resultRef = useRef<Dataset | null>(null);
  const [selectedContext, setSelectedContext] =
    useState<MetabotAdhocQueryInfo | null>(null);
  const [selectedClicked, setSelectedClicked] = useState<ClickObject | null>(
    null,
  );
  const [selectedClickedViaMention, setSelectedClickedViaMention] =
    useState<ClickObject | null>(null);
  const [isHighlightingSelection, setIsHighlightingSelection] = useState(false);
  const questionHash = question.path.replace(/^\/question#/, "");

  useRegisterMetabotContextProvider(
    async () =>
      selectedContext ? { user_is_viewing: [selectedContext] } : undefined,
    [selectedContext],
  );

  useEffect(() => {
    const handleMentionClick = (event: Event) => {
      const mentionEvent = getDataPointMentionEvent(event);
      const mentionTarget =
        mentionEvent.target ??
        (mentionEvent.id != null
          ? dataPointTargets?.[String(mentionEvent.id)]
          : undefined);
      const clickedFromTarget = getClickedObjectFromDataPointTarget(
        resultRef.current,
        mentionTarget,
      );
      console.warn("[metabot data-point] fullscreen mention event", {
        mentionEvent,
        mentionTarget,
        hasResult: resultRef.current != null,
        resultRowCount: resultRef.current?.data?.rows?.length,
        clickedFromTarget,
      });

      if (clickedFromTarget) {
        const question = questionRef.current;
        const selectedData = getSelectedChartData(clickedFromTarget);
        console.warn("[metabot data-point] fullscreen target resolved", {
          hasQuestion: question != null,
          selectedData,
        });
        panelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setSelectedClicked(null);
        setSelectedClickedViaMention(null);
        setIsHighlightingSelection(false);

        if (question && selectedData) {
          setSelectedContext({
            type: "adhoc",
            name: question.displayName() ?? undefined,
            query: question.datasetQuery(),
            chart_configs: [
              {
                title: question.displayName(),
                description: question.description() ?? undefined,
                query: question.datasetQuery(),
                display_type: question.display(),
                data: getChartData(resultRef.current),
                selected_data: selectedData,
              },
            ],
          });
        }

        requestAnimationFrame(() => {
          console.warn("[metabot data-point] fullscreen setting clicked", {
            clickedFromTarget,
          });
          setSelectedClickedViaMention(clickedFromTarget);
          setIsHighlightingSelection(true);
        });
        return;
      }

      const mentionId = getDataPointMentionEventId(event);
      const selectedData = selectedContext?.chart_configs?.[0]?.selected_data;
      const selectedRange = selectedContext?.chart_configs?.[0]?.selected_range;
      if (
        !mentionId ||
        (mentionId !== selectedData?.mention_id &&
          mentionId !== selectedRange?.mention_id)
      ) {
        console.warn("[metabot data-point] fullscreen mention ignored", {
          mentionId,
          selectedDataMentionId: selectedData?.mention_id,
          selectedRangeMentionId: selectedRange?.mention_id,
        });
        return;
      }

      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setIsHighlightingSelection(false);
      requestAnimationFrame(() => {
        console.warn("[metabot data-point] fullscreen restoring clicked", {
          selectedClicked,
        });
        setSelectedClickedViaMention(selectedClicked);
        setIsHighlightingSelection(true);
      });
    };

    window.addEventListener(
      "metabot:data-point-mention-click",
      handleMentionClick,
    );
    return () => {
      window.removeEventListener(
        "metabot:data-point-mention-click",
        handleMentionClick,
      );
    };
  }, [dataPointTargets, selectedClicked, selectedContext]);

  const handleVisualizationClick = useCallback(
    ({
      question,
      result,
      clicked,
    }: {
      question: Question;
      result: Dataset | null;
      clicked: ClickObject | null;
    }) => {
      const selectedData = getSelectedChartData(clicked);
      if (!selectedData) {
        return;
      }

      const mention = getDataPointMention(selectedData, dataPointTargets);
      const selectedDataWithMention = {
        ...selectedData,
        mention_id: mention.id,
      };

      if (mention.isGenerated && mention.target) {
        dispatch(
          rememberDataPointTarget({
            agentId,
            id: mention.id,
            target: mention.target,
          }),
        );
      }

      setSelectedClicked(clicked);
      setSelectedClickedViaMention(null);
      setIsHighlightingSelection(false);
      setSelectedContext({
        type: "adhoc",
        name: question.displayName() ?? undefined,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: question.displayName(),
            description: question.description() ?? undefined,
            query: question.datasetQuery(),
            display_type: question.display(),
            data: getChartData(result),
            selected_data: selectedDataWithMention,
          },
        ],
      });

      const mentionMarkdown = getDataPointMentionMarkdown(
        selectedData,
        mention.id,
      );
      const trimmedPrompt = prompt.trim();
      setPrompt(
        trimmedPrompt ? `${trimmedPrompt} ${mentionMarkdown}` : mentionMarkdown,
      );
      focusPromptInput();
    },
    [agentId, dataPointTargets, dispatch, focusPromptInput, prompt, setPrompt],
  );

  const handleTableSelectionMention = useCallback(
    ({
      question,
      result,
      selection,
    }: {
      question: Question;
      result: Dataset | null;
      selection: TableSelectionMention;
    }) => {
      const selectedRange = getSelectedChartRange(selection);
      const mentionId = getNextDataPointRangeMentionId();
      const selectedRangeWithMention = {
        ...selectedRange,
        mention_id: mentionId,
      };

      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setIsHighlightingSelection(false);
      setSelectedContext({
        type: "adhoc",
        name: question.displayName() ?? undefined,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: question.displayName(),
            description: question.description() ?? undefined,
            query: question.datasetQuery(),
            display_type: question.display(),
            data: getChartData(result),
            selected_range: selectedRangeWithMention,
          },
        ],
      });

      const mention = getDataPointRangeMentionMarkdown(
        selectedRange,
        mentionId,
      );
      const trimmedPrompt = prompt.trim();
      setPrompt(trimmedPrompt ? `${trimmedPrompt} ${mention}` : mention);
      focusPromptInput();
    },
    [focusPromptInput, prompt, setPrompt],
  );

  return (
    <Box
      ref={panelRef}
      className={cx(S.fullscreenQuestionPanel, {
        [S.fullscreenQuestionPanelHighlight]: isHighlightingSelection,
      })}
      onAnimationEnd={() => setIsHighlightingSelection(false)}
    >
      <Flex className={S.fullscreenQuestionHeader} align="center" gap="md">
        <Text fw="bold" truncate>
          {question.title}
        </Text>
        <ActionIcon
          ml="auto"
          onClick={onClose}
          aria-label={t`Close fullscreen question`}
        >
          <Icon name="close" />
        </ActionIcon>
      </Flex>
      <Box className={S.fullscreenQuestionBody}>
        <AdHocQuestionLoader questionHash={questionHash}>
          {({ question, loading: isLoadingQuestion, error: questionError }) => {
            if (questionError) {
              return (
                <FullscreenQuestionMessage
                  message={t`Could not load the question.`}
                />
              );
            }

            if (isLoadingQuestion || !question) {
              return (
                <FullscreenQuestionMessage message={t`Loading question...`} />
              );
            }

            return (
              <QuestionResultLoader question={question} collectionPreview>
                {({ result, rawSeries, loading: isLoadingResult, error }) => {
                  questionRef.current = question;
                  resultRef.current = result;

                  if (error) {
                    return (
                      <FullscreenQuestionMessage
                        message={t`Could not load the question.`}
                      />
                    );
                  }

                  return (
                    <QueryVisualization
                      question={question}
                      result={result}
                      rawSeries={rawSeries}
                      queryBuilderMode="view"
                      isRunnable={false}
                      isRunning={isLoadingResult || result == null}
                      isDirty={false}
                      isResultDirty={false}
                      clicked={selectedClicked}
                      clickedViaMention={selectedClickedViaMention}
                      handleVisualizationClick={(clicked: ClickObject | null) =>
                        handleVisualizationClick({
                          question,
                          result,
                          clicked,
                        })
                      }
                      onTableSelectionMention={(
                        selection: TableSelectionMention,
                      ) =>
                        handleTableSelectionMention({
                          question,
                          result,
                          selection,
                        })
                      }
                    />
                  );
                }}
              </QuestionResultLoader>
            );
          }}
        </AdHocQuestionLoader>
      </Box>
    </Box>
  );
};

const FullscreenQuestionMessage = ({ message }: { message: string }) => (
  <Flex h="100%" align="center" justify="center">
    <Text c="text-secondary">{message}</Text>
  </Flex>
);

export const MetabotQueryBuilder = (
  props: React.ComponentProps<typeof QueryBuilder>,
) => {
  const { hasNlqAccess, isLoading } = useUserMetabotPermissions();
  const areSettingsLoading = useSelector(getSettingsLoading);
  // Wait until settings and metabot permissions are both resolved before
  // deciding which view to render. Otherwise QueryBuilder may mount briefly
  // and rewrite the URL away from /question/ask, racing the metabot view.
  if (areSettingsLoading || isLoading) {
    return null;
  }
  if (!hasNlqAccess) {
    return <QueryBuilder {...props} />;
  }
  return <MetabotQueryBuilderInner />;
};
