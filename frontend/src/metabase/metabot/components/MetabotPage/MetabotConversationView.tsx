import { useDisclosure } from "@mantine/hooks";
import { isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Flex,
  Icon,
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
    retryMessage,
    cancelRequest,
    selectedDatabaseId,
    setSelectedDatabaseId,
    modelOverride,
    setModelOverride,
    title: conversationTitle,
  } = useMetabotAgent(agentId);

  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  const [hasError, setHasError] = useState(false);
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
    hasMessages || isDoingScience || alwaysShowConversation;
  const showHeader = hasMessages || alwaysShowConversation;
  const isFading = isNewConversation && isDoingScience;

  const { scrollContainerRef, fillerRef } = useScrollManager(showConversation);
  const conversationContainerRef = useRef<HTMLDivElement>(null);
  const bottomInputRef = useRef<HTMLDivElement>(null);

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

  const handleSubmitPrompt = async (text: string) => {
    setHasError(false);

    const action = await submitInput(text, { preventOpenSidebar: true });

    onAfterSubmit?.();

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

  const inputDisabled = prompt.trim().length === 0 || isDoingScience;

  const promptInput = useMemo(
    () => (
      <Paper
        className={cx(
          S.inputContainer,
          showConversation && isDoingScience && S.inputContainerLoading,
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
              disabled={isDoingScience}
            />
          </Box>
          {hasError ? (
            <Text c="error" ta="center">
              {t`Something went wrong. Please try again.`}
            </Text>
          ) : null}
          <Flex align="center" gap="sm">
            <MetabotModelSelector
              disabled={isDoingScience}
              dropdownPosition="top"
              modelOverride={modelOverride}
              onModelOverrideChange={setModelOverride}
            />
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
      showConversation,
    ],
  );

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
              <Messages
                agentId={agentId}
                messages={messages}
                onRetryMessage={retryMessage}
                isDoingScience={isDoingScience}
                debug={debugMode}
                dataPointTargets={getDataPointTargetsFromState(requestState)}
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
          <Box ref={bottomInputRef} className={S.bottomInputContainer}>
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

      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};
