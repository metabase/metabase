import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { useDispatch } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import {
  useMetabotAgent,
  useMetabotName,
  usePromptInputFocusEffect,
  useUserMetabotPermissions,
} from "../../hooks";
import {
  type MetabotAgentId,
  expandConversation,
  isChatAgentId,
} from "../../state";

import Styles from "./MetabotChat.module.css";
import { MetabotChatEditor } from "./MetabotChatEditor";
import { Messages } from "./MetabotChatMessage";
import { MetabotThinking } from "./MetabotThinking";
import {
  getDataPointTargetsFromState,
  getDataSelectionsFromState,
} from "./data-point-mentions";
import { useScrollManager } from "./hooks";

export interface MetabotConfig {
  agentId?: MetabotAgentId;
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventClose?: boolean;
  preventRetryMessage?: boolean;
  preventForkMessage?: boolean;
  suggestionModels: SuggestionModel[];
}

const defaultSuggestionModels: SuggestionModel[] = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
];

export const MetabotChat = ({
  agentId,
  config,
}: {
  agentId: MetabotAgentId;
  config?: MetabotConfig;
}) => {
  const suggestionModels = config?.suggestionModels ?? defaultSuggestionModels;
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const dispatch = useDispatch();
  const metabot = useMetabotAgent(agentId);
  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  usePromptInputFocusEffect(
    agentId,
    useCallback(() => promptInputRef.current?.focus(), []),
  );
  const metabotName = useMetabotName();
  const { isConfigured } = useUserMetabotPermissions();

  const hasMessages = metabot.messages.length > 0;

  const { scrollContainerRef, headerRef, fillerRef } =
    useScrollManager(hasMessages);

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery(
    {
      metabot_id: metabot.metabotId,
      limit: 3,
      sample: true,
    },
    { skip: !isConfigured },
  );
  const suggestedPrompts = useMemo(() => {
    return suggestedPromptsReq.currentData?.prompts ?? [];
  }, [suggestedPromptsReq.currentData?.prompts]);

  const handleClose = () => {
    metabot.setPrompt("");
    metabot.setVisible(false);
  };

  const canExpand = isChatAgentId(agentId);
  const handleExpand = () => {
    dispatch(expandConversation({ agentId }));
  };

  const handleEditorSubmit = () => metabot.submitInput(metabot.prompt);

  return (
    <Box className={Styles.container} data-testid="metabot-chat">
      {/* header */}
      <Box ref={headerRef} className={Styles.header}>
        <Flex align-items="center" miw={0} style={{ flex: 1, minWidth: 0 }}>
          <Text lh={1} fz="0.8125rem" fw="bold" c="text-primary" truncate>
            {metabot.title}
          </Text>
        </Flex>

        <Flex gap="xs">
          {canExpand && (
            <Tooltip label={t`Expand`} position="bottom">
              <ActionIcon
                onClick={handleExpand}
                data-testid="metabot-expand-chat"
              >
                <Icon c="text-primary" name="expand" />
              </ActionIcon>
            </Tooltip>
          )}
          {!config?.preventClose && (
            <Tooltip label={t`Minimize`} position="bottom">
              <ActionIcon
                onClick={handleClose}
                data-testid="metabot-minimize-chat"
              >
                <Icon c="text-primary" name="chevrondown" />
              </ActionIcon>
            </Tooltip>
          )}
          {!config?.preventClose && (
            <ActionIcon onClick={handleClose} data-testid="metabot-close-chat">
              <Icon c="text-primary" name="close" />
            </ActionIcon>
          )}
        </Flex>
      </Box>

      {/* chat messages */}
      <Box
        ref={scrollContainerRef}
        className={Styles.messagesContainer}
        data-testid="metabot-chat-messages"
      >
        {!hasMessages && !metabot.isDoingScience && (
          <>
            {/* empty state */}
            <Flex
              h="100%"
              gap="md"
              direction="column"
              align="center"
              justify="center"
              data-testid="metabot-empty-chat-info"
            >
              {/* {showIllustrations && (
                <Box component={EmptyDashboardBot} w="6rem" />
              )} */}
              {!isConfigured ? (
                <AIProviderConfigurationNotice
                  featureName={metabotName}
                  onConfigureAi={openAiProviderConfigurationModal}
                />
              ) : // <Text c="text-tertiary" maw="12rem" ta="center" lh="lg">
              //   {config?.emptyText ??
              //     (showIllustrations
              //       ? t`I can help you explore your metrics and models.`
              //       : t`Explore your metrics and models with AI.`)}
              // </Text>
              null}
            </Flex>
            {isConfigured && !config?.hideSuggestedPrompts && (
              <Stack
                gap="sm"
                className={Styles.promptSuggestionsContainer}
                data-testid="metabot-prompt-suggestions"
              >
                <>
                  {suggestedPrompts.map(({ prompt }, index) => (
                    <Box key={index}>
                      <Button
                        fz="sm"
                        size="xs"
                        onClick={() => metabot.submitInput(prompt)}
                        className={Styles.promptSuggestionButton}
                      >
                        {prompt}
                      </Button>
                    </Box>
                  ))}
                </>
              </Stack>
            )}
          </>
        )}

        {(hasMessages || metabot.isDoingScience) && (
          <Box
            className={Styles.messages}
            data-testid="metabot-chat-inner-messages"
          >
            {/* conversation messages */}
            <Messages
              agentId={agentId}
              messages={metabot.messages}
              onRetryMessage={
                config?.preventRetryMessage ? undefined : metabot.retryMessage
              }
              onForkMessage={
                config?.preventForkMessage || !isChatAgentId(agentId)
                  ? undefined
                  : metabot.forkMessage
              }
              isDoingScience={metabot.isDoingScience}
              debug={metabot.debugMode}
              dataPointTargets={getDataPointTargetsFromState(
                metabot.requestState,
              )}
              dataSelections={getDataSelectionsFromState(metabot.requestState)}
            />
            {/* loading */}
            {metabot.isDoingScience && (
              <MetabotThinking toolCalls={metabot.activeToolCalls} />
            )}
            {/* filler - height gets set via ref mutation */}
            <div ref={fillerRef} data-testid="metabot-message-filler" />
            {/* long convo warning */}
            {metabot.isLongConversation && (
              <MetabotResetLongChatButton
                onResetConversation={metabot.resetConversation}
              />
            )}
          </Box>
        )}
      </Box>

      {isConfigured && (
        <Box className={Styles.textInputContainer}>
          <Paper
            className={cx(
              Styles.inputContainer,
              metabot.isDoingScience && Styles.inputContainerLoading,
            )}
          >
            <MetabotChatEditor
              ref={promptInputRef}
              value={metabot.prompt}
              autoFocus
              isResponding={metabot.isDoingScience}
              modelOverride={metabot.modelOverride}
              selectedDatabaseId={metabot.selectedDatabaseId}
              placeholder={t`How can I help? Type @ to mention items.`}
              onChange={metabot.setPrompt}
              onModelOverrideChange={metabot.setModelOverride}
              onSelectedDatabaseIdChange={metabot.setSelectedDatabaseId}
              onSubmit={handleEditorSubmit}
              onStop={metabot.cancelRequest}
              suggestionConfig={{ suggestionModels }}
            />
          </Paper>
          <Text fz="xs" c="text-tertiary" ta="center" pt={0}>
            {t`${metabotName} isn't perfect. Double-check results.`}
          </Text>
        </Box>
      )}
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};
