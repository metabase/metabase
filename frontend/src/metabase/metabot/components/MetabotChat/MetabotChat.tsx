import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg?component";
import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { Box, Button, Flex, Paper, Stack, Text } from "metabase/ui";

import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "../../hooks";
import type { MetabotConfig } from "../Metabot";

import Styles from "./MetabotChat.module.css";
import { MetabotChatEditor } from "./MetabotChatEditor";
import { Messages } from "./MetabotChatMessage";
import { MetabotThinking } from "./MetabotThinking";
import { useScrollManager } from "./hooks";

const defaultConfig: MetabotConfig = {
  agentId: "omnibot",
  suggestionModels: [
    "dataset",
    "metric",
    "card",
    "table",
    "database",
    "dashboard",
  ],
};

export const MetabotChat = ({
  config = defaultConfig,
  className,
  headerActions,
}: {
  config?: MetabotConfig;
  className?: string;
  headerActions?: ReactNode;
}) => {
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const metabot = useMetabotAgent(config.agentId);
  const metabotName = useMetabotName();
  const { isConfigured } = useUserMetabotPermissions();
  const showIllustrations = useSetting("metabot-show-illustrations");

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

  const handleEditorSubmit = () => metabot.submitInput(metabot.prompt);

  return (
    <Box className={cx(Styles.container, className)} data-testid="metabot-chat">
      {headerActions && (
        <Box ref={headerRef} className={Styles.header}>
          {headerActions}
        </Box>
      )}

      {/* chat messages */}
      <Box className={Styles.messagesScrollArea}>
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
                px="md"
                direction="column"
                align="center"
                justify="center"
                data-testid="metabot-empty-chat-info"
              >
                {showIllustrations && (
                  <Box component={EmptyDashboardBot} w="6rem" />
                )}
                {!isConfigured ? (
                  <AIProviderConfigurationNotice
                    featureName={metabotName}
                    onConfigureAi={openAiProviderConfigurationModal}
                  />
                ) : (
                  <Text c="text-disabled" maw="12rem" ta="center" lh="lg">
                    {config.emptyText ??
                      (showIllustrations
                        ? t`I can help you explore your metrics and models.`
                        : t`Explore your metrics and models with AI.`)}
                  </Text>
                )}
              </Flex>
              {isConfigured && !config.hideSuggestedPrompts && (
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
                messages={metabot.messages}
                onRetryMessage={
                  config.preventRetryMessage ? undefined : metabot.retryMessage
                }
                isDoingScience={metabot.isDoingScience}
                debug={metabot.debugMode}
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
              ref={metabot.promptInputRef}
              value={metabot.prompt}
              autoFocus
              isResponding={metabot.isDoingScience}
              placeholder={t`How can I help? Type @ to mention items.`}
              onChange={metabot.setPrompt}
              onSubmit={handleEditorSubmit}
              onStop={metabot.cancelRequest}
              suggestionConfig={{
                suggestionModels: config.suggestionModels,
              }}
            />
          </Paper>
          <Text mt="sm" pb="0.5rem" fz="sm" c="text-secondary" ta="center">
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
