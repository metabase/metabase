import { useDisclosure } from "@mantine/hooks";
import { isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { useSetting } from "metabase/common/hooks";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotDatabaseSelect } from "metabase/metabot/components/MetabotChat/MetabotDatabaseSelect";
import { MetabotTurnDotField } from "metabase/metabot/components/MetabotChat/MetabotDotField/MetabotTurnDotField";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import { getDataPointTargetsFromState } from "metabase/metabot/components/MetabotChat/data-point-mentions";
import { useScrollManager } from "metabase/metabot/components/MetabotChat/hooks";
import { MetabotModelSelector } from "metabase/metabot/components/MetabotModelSelector";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { MetabotAgentId } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Menu,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MetabotPage.module.css";

const SUGGESTION_MODELS = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
] as const;

const getTitleText = () =>
  _.sample([
    t`What would you like to know?`,
    t`What do you want to explore?`,
    t`What are you looking to learn?`,
  ]);

type HeaderAction = {
  icon: IconName;
  label: string;
  testId: string;
  onClick: () => void;
};

type MetabotConversationViewProps = {
  agentId: MetabotAgentId;
  isNewConversation: boolean;
  headerAction?: HeaderAction;
  onAfterSubmit?: () => void;
  alwaysShowConversation?: boolean;
};

export const MetabotConversationView = ({
  agentId,
  isNewConversation,
  headerAction,
  onAfterSubmit,
  alwaysShowConversation = false,
}: MetabotConversationViewProps) => {
  const { canUseNlq } = useUserMetabotPermissions();
  const landingPageIllustration = useSelector(getLandingPageIllustration);
  const showIllustrations = useSetting("metabot-show-illustrations");

  const {
    metabotId,
    resetConversation,
    isDoingScience,
    messages,
    activeToolCalls,
    debugMode,
    requestState,
    isLongConversation,
    prompt,
    setPrompt,
    submitInput,
    queueMessage,
    queuedMessages,
    submitQueuedMessage,
    editQueuedMessage,
    removeQueuedMessage,
    prioritizeQueuedMessage,
    retryMessage,
    forkMessage,
    cancelRequest,
    selectedDatabaseId,
    setSelectedDatabaseId,
    modelOverride,
    setModelOverride,
    title: conversationTitle,
  } = useMetabotAgent(agentId);

  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  // Guards against submitting more than one queued message at a time. This must
  // be a ref (not state): submitting a message dispatches `removeQueuedMessage`,
  // which — via react-redux's useSyncExternalStore — forces a *synchronous*
  // re-render before a `setState` guard would have committed. A ref flips
  // synchronously, so that re-render's effect run sees the guard already set and
  // bails instead of submitting (and thereby wiping) the rest of the queue.
  const isSubmittingQueuedMessageRef = useRef(false);
  // Bumped after each queued submission settles to reliably re-run the drain
  // effect — clearing the ref alone wouldn't trigger a re-render.
  const [queueDrainTick, setQueueDrainTick] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isThinkingMounted, setIsThinkingMounted] = useState(isDoingScience);
  const [title] = useState(getTitleText);
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);

  const hasMessages = messages.length > 0;
  const showConversation =
    hasMessages ||
    isDoingScience ||
    isThinkingMounted ||
    alwaysShowConversation;
  const showHeader = hasMessages || alwaysShowConversation;
  const isFading = isNewConversation && isDoingScience;

  const { scrollContainerRef, fillerRef } = useScrollManager(showConversation);
  const conversationContainerRef = useRef<HTMLDivElement>(null);
  const bottomInputRef = useRef<HTMLDivElement>(null);

  useEffect(
    function showThinkingRow() {
      if (isDoingScience) {
        setIsThinkingMounted(true);
      }
    },
    [isDoingScience],
  );

  const handleThinkingExitComplete = useCallback(() => {
    if (!isDoingScience) {
      setIsThinkingMounted(false);
    }
  }, [isDoingScience]);

  useEffect(
    function measureBottomInput() {
      const conversationContainer = conversationContainerRef.current;
      const bottomInput = bottomInputRef.current;

      if (!showConversation || !conversationContainer || !bottomInput) {
        return;
      }

      const updateInputHeight = () => {
        conversationContainer.style.setProperty(
          "--metabot-input-height",
          `${bottomInput.offsetHeight}px`,
        );
      };

      updateInputHeight();

      const resizeObserver = new ResizeObserver(updateInputHeight);
      resizeObserver.observe(bottomInput);

      return () => {
        resizeObserver.disconnect();
        conversationContainer.style.removeProperty("--metabot-input-height");
      };
    },
    [showConversation],
  );

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: 4,
    sample: true,
  });
  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;

  useEffect(
    function sendNextQueuedMessage() {
      if (
        isDoingScience ||
        isSubmittingQueuedMessageRef.current ||
        queuedMessages.length === 0
      ) {
        return;
      }

      // Send queued messages strictly one at a time: take the head, and don't
      // touch the rest until this one's agent turn has fully settled. The ref is
      // set synchronously so any same-tick re-render bails here rather than
      // submitting the next message while this one is still in flight (which
      // would drop it — submitInput no-ops while the agent is busy).
      isSubmittingQueuedMessageRef.current = true;
      const settle = () => {
        isSubmittingQueuedMessageRef.current = false;
        setQueueDrainTick((tick) => tick + 1);
      };
      const submission = submitQueuedMessage(queuedMessages[0].id);
      if (!submission) {
        settle();
        return;
      }
      submission.finally(settle);
    },
    [isDoingScience, queueDrainTick, queuedMessages, submitQueuedMessage],
  );

  const handleSubmitPrompt = async (text: string) => {
    setHasError(false);

    if (isDoingScience) {
      queueMessage(text);
      return;
    }

    const submission = submitInput(text, { preventOpenSidebar: true });
    onAfterSubmit?.();
    const action = await submission;

    if (isRejected(action)) {
      setHasError(true);
      return;
    }

    if (!action.payload.success) {
      if (action.payload.shouldRetry) {
        setPrompt(text);
      }
      setHasError(true);
    }
  };

  const handleEditorSubmit = () => handleSubmitPrompt(prompt);

  const handleSendQueuedMessageNow = (messageId: string) => {
    if (isDoingScience) {
      prioritizeQueuedMessage(messageId);
      cancelRequest();
      return;
    }

    submitQueuedMessage(messageId);
  };

  const inputDisabled = prompt.trim().length === 0;

  const promptInput = useMemo(
    () => (
      <Paper className={S.inputContainer}>
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
              disabled={false}
              placeholder={t`Ask about your data, and type @ to mention an item`}
              onChange={setPrompt}
              onSubmit={handleEditorSubmit}
              onStop={cancelRequest}
              suggestionConfig={{
                suggestionModels: [...SUGGESTION_MODELS],
              }}
            />
          )}
        </Box>
        <Box className={S.inputActions}>
          <Box mr="auto">
            <MetabotDatabaseSelect
              value={selectedDatabaseId}
              onChange={setSelectedDatabaseId}
            />
          </Box>
          {hasError ? (
            <Text c="error" ta="center">
              {t`Something went wrong. Please try again.`}
            </Text>
          ) : null}
          <Flex align="center" gap="sm">
            <MetabotModelSelector
              dropdownPosition="top"
              modelOverride={modelOverride}
              onModelOverrideChange={setModelOverride}
            />
            {isDoingScience && inputDisabled ? (
              <ActionIcon
                className={S.stopButton}
                variant="outline"
                size="2rem"
                onClick={cancelRequest}
                data-testid="metabot-stop-response"
                aria-label={t`Stop response`}
              >
                <Icon name="stop" />
              </ActionIcon>
            ) : (
              <ActionIcon
                className={S.sendButton}
                variant="filled"
                size="2rem"
                disabled={!canUseNlq || inputDisabled}
                onClick={handleEditorSubmit}
                data-testid="metabot-send-message"
                aria-label={t`Send`}
              >
                <Icon name="arrow_up" />
              </ActionIcon>
            )}
          </Flex>
        </Box>
      </Paper>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canUseNlq,
      cancelRequest,
      hasError,
      inputDisabled,
      isDoingScience,
      modelOverride,
      openAiProviderConfigurationModal,
      prompt,
      selectedDatabaseId,
      setModelOverride,
      setPrompt,
      setSelectedDatabaseId,
    ],
  );

  const queuedMessagesNode =
    queuedMessages.length > 0 ? (
      <Box className={S.queuedMessages} data-testid="metabot-queued-messages">
        {queuedMessages.map((queuedMessage) => (
          <Flex
            key={queuedMessage.id}
            className={S.queuedMessage}
            align="center"
            gap="sm"
            data-testid="metabot-queued-message"
          >
            <Icon
              name="clock"
              size={14}
              c="text-secondary"
              className={S.queuedMessageIcon}
            />
            <Text
              fz="sm"
              c="text-primary"
              truncate
              className={S.queuedMessageText}
            >
              {queuedMessage.message}
            </Text>
            <Button
              className={S.queuedMessageSteer}
              size="compact-xs"
              variant="subtle"
              color="text-secondary"
              leftSection={<Icon name="enter_or_return" size={12} />}
              onClick={() => handleSendQueuedMessageNow(queuedMessage.id)}
            >
              {isDoingScience ? t`Steer` : t`Send`}
            </Button>
            <Tooltip label={t`Remove`} position="top">
              <ActionIcon
                size="sm"
                c="text-secondary"
                aria-label={t`Remove queued message`}
                onClick={() => removeQueuedMessage(queuedMessage.id)}
              >
                <Icon name="trash" size={14} />
              </ActionIcon>
            </Tooltip>
            <Menu position="top-end">
              <Menu.Target>
                <ActionIcon
                  size="sm"
                  c="text-secondary"
                  aria-label={t`More actions for queued message`}
                >
                  <Icon name="ellipsis" size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="pencil" />}
                  onClick={() => editQueuedMessage(queuedMessage.id)}
                >
                  {t`Edit`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Flex>
        ))}
      </Box>
    ) : null;

  return (
    <Box className={S.page}>
      {showHeader && (
        <Flex className={S.pageHeader} align="center" justify="space-between">
          <Text
            fz="md"
            fw={600}
            c="text-primary"
            truncate
            data-testid="metabot-page-title"
          >
            {conversationTitle}
          </Text>
          {headerAction && (
            <Tooltip label={headerAction.label} position="bottom">
              <ActionIcon
                onClick={headerAction.onClick}
                data-testid={headerAction.testId}
              >
                <Icon c="text-primary" name={headerAction.icon} />
              </ActionIcon>
            </Tooltip>
          )}
        </Flex>
      )}

      {!showConversation && showIllustrations && landingPageIllustration && (
        <Box
          className={cx(S.backgroundIllustration, {
            [S.backgroundIllustrationFading]: isFading,
          })}
        >
          {landingPageIllustration.isDefault ? (
            <LighthouseIllustration />
          ) : (
            <Box
              data-testid="landing-page-illustration"
              pos="absolute"
              inset={0}
              bgsz="100% auto"
              bgr="no-repeat"
              bgp="bottom"
              style={{
                backgroundImage: `url(${landingPageIllustration.src})`,
              }}
            />
          )}
        </Box>
      )}

      {showConversation ? (
        <Box ref={conversationContainerRef} className={S.conversationContainer}>
          <Box
            ref={scrollContainerRef}
            className={S.messagesContainer}
            data-testid="metabot-chat-messages"
          >
            <Box className={S.messages}>
              <MetabotTurnDotField className={S.turnDotField} />
              <Messages
                agentId={agentId}
                messages={messages}
                onRetryMessage={retryMessage}
                onForkMessage={forkMessage}
                isDoingScience={isDoingScience}
                debug={debugMode}
                dataPointTargets={getDataPointTargetsFromState(requestState)}
              />
              {isThinkingMounted && (
                <MetabotThinking
                  toolCalls={activeToolCalls}
                  isExiting={!isDoingScience}
                  onExitComplete={handleThinkingExitComplete}
                />
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
          <Box ref={bottomInputRef} className={S.bottomInputContainer}>
            {queuedMessagesNode}
            {promptInput}
            <Text
              fz="sm"
              c="text-secondary"
              ta="center"
              className={S.disclaimer}
            >
              {t`Metabot isn't perfect. Double-check results.`}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box className={S.centeredContainer}>
          <Box className={cx(S.greeting, { [S.greetingFading]: isFading })}>
            {showIllustrations && <MetabotLogo className={S.greetingIcon} />}
            <Text fz={{ base: "xl", sm: 32 }} fw={600} c="text-primary">
              {title}
            </Text>
          </Box>

          <Stack gap="lg" className={S.inputWrapper}>
            {queuedMessagesNode}
            {promptInput}

            <Box
              className={cx(S.promptSuggestionsContainer, {
                [S.promptSuggestionsFading]: isFading,
              })}
            >
              {canUseNlq
                ? suggestedPrompts?.map(
                    ({ prompt: suggestedPrompt }, index) => (
                      <UnstyledButton
                        key={index}
                        className={S.promptSuggestion}
                        onClick={() => handleSubmitPrompt(suggestedPrompt)}
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

      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};
