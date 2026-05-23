import { useDisclosure } from "@mantine/hooks";
import { isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { useSetting } from "metabase/common/hooks";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotDatabaseSelect } from "metabase/metabot/components/MetabotChat/MetabotDatabaseSelect";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import { useScrollManager } from "metabase/metabot/components/MetabotChat/hooks";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { useSelector } from "metabase/redux";
import { getSettingsLoading } from "metabase/selectors/settings";
import {
  ActionIcon,
  Box,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import {
  useMetabotAgent,
  usePromptInputFocusEffect,
  useUserMetabotPermissions,
} from "../../hooks";
import { AIProviderConfigurationNotice } from "../AIProviderConfigurationNotice";

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
    isLongConversation,
    prompt,
    setPrompt,
    submitInput,
    retryMessage,
    cancelRequest,
    selectedDatabaseId,
    setSelectedDatabaseId,
  } = useMetabotAgent();
  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  usePromptInputFocusEffect(
    "omnibot",
    useCallback(() => promptInputRef.current?.focus(), []),
  );

  const [title] = useState(getTitleText);
  const [hasError, setHasError] = useState(false);
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
    if (!hasMessages) {
      resetConversation();
    }
    setHasError(false);

    const action = await submitInput(prompt, {
      preventOpenSidebar: true,
      suppressNavigateTo: true,
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
        <Box>
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
    </Paper>
  );

  return (
    <Box className={S.page}>
      {showConversation ? (
        <Box className={S.conversationContainer}>
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
                agentId="omnibot"
                messages={messages}
                onRetryMessage={retryMessage}
                isDoingScience={isDoingScience}
                debug={debugMode}
              />
              {isDoingScience && (
                <MetabotThinking toolCalls={activeToolCalls} />
              )}
              <div ref={fillerRef} data-testid="metabot-message-filler" />
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
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};

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
