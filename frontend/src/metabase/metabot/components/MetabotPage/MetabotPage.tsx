import { useDisclosure } from "@mantine/hooks";
import { isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetMetabotChatConversationQuery,
  useGetSuggestedMetabotPromptsQuery,
} from "metabase/api";
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
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import {
  type MetabotAgentId,
  createAgent,
  getActiveMetabotAgentIds,
  hydrateChatConversation,
  setExpanded,
  setVisible,
} from "metabase/metabot/state";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { useDispatch, useSelector } from "metabase/redux";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import { removeTab, tabsSelectors } from "metabase/tabs/tabs.slice";
import {
  ActionIcon,
  Box,
  Center,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { uuid } from "metabase/utils/uuid";

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

type Props = {
  params?: { conversationId?: string };
};

export const MetabotPage = ({ params }: Props) => {
  const urlConversationId = params?.conversationId;
  const dispatch = useDispatch();
  const activeAgentIds = useSelector(getActiveMetabotAgentIds);

  const [draftConversationId] = useState(() => urlConversationId ?? uuid());
  const conversationId = urlConversationId ?? draftConversationId;
  const agentId: MetabotAgentId = `chat_${conversationId}`;
  const agentExists = activeAgentIds.includes(agentId);
  const isNewConversation = !urlConversationId;

  useEffect(() => {
    if (isNewConversation && !agentExists) {
      dispatch(createAgent({ agentId, visible: false, conversationId }));
    }
  }, [dispatch, agentId, agentExists, conversationId, isNewConversation]);

  const conversationQuery = useGetMetabotChatConversationQuery(
    urlConversationId ?? "",
    { skip: !urlConversationId || agentExists },
  );

  useEffect(() => {
    if (!urlConversationId || agentExists || !conversationQuery.data) {
      return;
    }
    const { conversation_id, title, chat_messages, history, state } =
      conversationQuery.data;
    dispatch(
      hydrateChatConversation({
        agentId,
        conversationId: conversation_id,
        title,
        messages: normalizeFetchedChatMessages(chat_messages ?? []),
        history,
        state,
        expanded: true,
      }),
    );
  }, [
    dispatch,
    agentId,
    agentExists,
    urlConversationId,
    conversationQuery.data,
  ]);

  if (!agentExists) {
    if (urlConversationId && conversationQuery.isError) {
      return (
        <Box className={S.page}>
          {/* TODO: design a real not-found / restore-failure state */}
          <Center h="100%">
            <Text c="text-secondary">{t`We couldn't load this conversation.`}</Text>
          </Center>
        </Box>
      );
    }
    return <Box className={S.page} />;
  }

  return (
    <MetabotConversation
      agentId={agentId}
      conversationId={conversationId}
      isNewConversation={isNewConversation}
    />
  );
};

type MetabotConversationProps = {
  agentId: MetabotAgentId;
  conversationId: string;
  isNewConversation: boolean;
};

const MetabotConversation = ({
  agentId,
  conversationId,
  isNewConversation,
}: MetabotConversationProps) => {
  const dispatch = useDispatch();
  const { canUseNlq } = useUserMetabotPermissions();
  const landingPageIllustration = useSelector(getLandingPageIllustration);
  const showIllustrations = useSetting("metabot-show-illustrations");
  const tabs = useSelector(tabsSelectors.selectAll);

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
    forkMessage,
    cancelRequest,
    selectedDatabaseId,
    setSelectedDatabaseId,
    title: conversationTitle,
  } = useMetabotAgent(agentId);

  const handleCollapse = () => {
    dispatch(setExpanded({ agentId, expanded: false }));
    dispatch(setVisible({ agentId, visible: true }));

    const urlId = agentId.replace(/^chat_/, "");
    const currentTab = tabs.find((tab) => tab.path === `/chat/${urlId}`);

    if (currentTab && tabs.length > 1) {
      const index = tabs.findIndex((tab) => tab.id === currentTab.id);
      const neighbor = index > 0 ? tabs[index - 1] : tabs[index + 1];
      dispatch(removeTab(currentTab.id));
      dispatch(push(neighbor?.path ?? "/"));
    } else {
      dispatch(push("/"));
    }
  };

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
  const showConversation = hasMessages || isDoingScience;
  const isFading = isNewConversation && isDoingScience;

  const { scrollContainerRef, fillerRef } = useScrollManager(showConversation);

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: 4,
    sample: true,
  });
  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;

  const handleSubmitPrompt = async (text: string) => {
    setHasError(false);

    const action = await submitInput(text, { preventOpenSidebar: true });

    if (isNewConversation) {
      dispatch(push(`/chat/${conversationId}`));
    }

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
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canUseNlq,
      cancelRequest,
      hasError,
      inputDisabled,
      isDoingScience,
      openAiProviderConfigurationModal,
      prompt,
      selectedDatabaseId,
      setPrompt,
      setSelectedDatabaseId,
      showConversation,
    ],
  );

  return (
    <Box className={S.page}>
      {hasMessages && (
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
          <Tooltip label={t`Collapse`} position="bottom">
            <ActionIcon
              onClick={handleCollapse}
              data-testid="metabot-collapse-chat"
            >
              <Icon c="text-primary" name="contract" />
            </ActionIcon>
          </Tooltip>
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
        <Box className={S.conversationContainer}>
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
                onForkMessage={forkMessage}
                isDoingScience={isDoingScience}
                debug={debugMode}
                dataPointTargets={getDataPointTargetsFromState(requestState)}
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
          <Box className={S.bottomInputContainer}>
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
