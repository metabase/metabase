import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg?component";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotLongChatNotice } from "metabase/metabot/components/MetabotChat/MetabotLongChatNotice";
import { useSetting } from "metabase/settings";
import {
  Box,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import { useGetSuggestedMetabotPromptsQuery } from "../../api";
import { useMetabotConversation, useUserMetabotPermissions } from "../../hooks";
import type { MetabotAgentId } from "../../state";
import type { MetabotChatConfig } from "../Metabot";

import Styles from "./MetabotChat.module.css";
import { MetabotChatEditor } from "./MetabotChatEditor";
import { Messages } from "./MetabotChatMessage";
import { MetabotContextUsageRing } from "./MetabotContextUsageRing";
import { useScrollManager } from "./hooks";

const defaultConfig: MetabotChatConfig = {
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
  conversationId,
  agentId,
  onNewConversation,
  config = defaultConfig,
  className,
  headerActions,
  size = "md",
}: {
  conversationId: string;
  agentId?: MetabotAgentId;
  onNewConversation?: () => void;
  config?: MetabotChatConfig;
  className?: string;
  headerActions?: ReactNode;
  size?: "md" | "lg";
}) => {
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const metabot = useMetabotConversation(conversationId);
  const metabotName = useSetting("metabot-name");
  const { isConfigured } = useUserMetabotPermissions();
  const showIllustrations = useSetting("metabot-show-illustrations");
  const supportsReasoning =
    useSetting("llm-metabot-supports-reasoning?") ?? true;

  const hasMessages = metabot.messages.length > 0;

  const { scrollContainerRef, fillerRef } = useScrollManager(
    hasMessages,
    metabot.conversationId,
  );

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

  const untitledLabel = metabot.forkedFromConversationId
    ? t`Forked conversation`
    : t`New conversation`;
  const title = hasMessages ? metabot.title || untitledLabel : undefined;

  const shouldShowHeader = headerActions || title;

  return (
    <Box
      className={cx(Styles.container, size === "lg" && Styles.large, className)}
      data-testid="metabot-chat"
    >
      {shouldShowHeader && (
        <Box className={Styles.header} data-testid="metabot-chat-header">
          {title && (
            <Text
              className={Styles.headerTitle}
              c={metabot.title ? "text-primary" : "text-secondary"}
              fw={metabot.title ? "bold" : "normal"}
              truncate
              title={title}
              data-testid="metabot-conversation-title"
            >
              {title}
            </Text>
          )}
          {headerActions && (
            <Box className={Styles.headerActions}>{headerActions}</Box>
          )}
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
                gap="lg"
                px="lg"
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
                  className={cx(
                    Styles.promptSuggestionsContainer,
                    metabot.prompt.length > 0 && Styles.promptSuggestionsHidden,
                  )}
                  data-testid="metabot-prompt-suggestions"
                >
                  <>
                    {suggestedPrompts.map(({ prompt }, index) => (
                      <UnstyledButton
                        key={index}
                        fz="sm"
                        onClick={() => metabot.submitInput(prompt)}
                        className={Styles.promptSuggestionButton}
                        bg="background_surface-brand-subtle"
                        bdrs="lg"
                        lh="xl"
                      >
                        <Flex gap="sm">
                          <Icon
                            name="bolt"
                            size={16}
                            c="icon-brand"
                            style={{ transform: "translateY(1px)" }}
                          />
                          <Box>{prompt}</Box>
                        </Flex>
                      </UnstyledButton>
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
                onContinueMessage={metabot.submitInput}
                onRefreshConversation={() => {
                  metabot.setPrompt("");
                  metabot.reloadConversation();
                }}
                isDoingScience={metabot.isDoingScience}
                supportsReasoning={supportsReasoning}
                debug={metabot.debugMode}
                agentId={agentId}
                conversationId={metabot.conversationId}
                size={size}
              />
              {/* filler - height gets set via ref mutation */}
              <div ref={fillerRef} data-testid="metabot-message-filler" />
            </Box>
          )}
        </Box>
      </Box>

      {isConfigured && (
        <Box className={Styles.footerContainer}>
          <Box className={Styles.textInputContainer}>
            {metabot.longChatNotice && onNewConversation && (
              <MetabotLongChatNotice
                variant={metabot.longChatNotice}
                onNewChat={onNewConversation}
              />
            )}
            {!metabot.isContextWindowFull && (
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
                  onChange={metabot.setPrompt}
                  onSubmit={() => metabot.submitInput(metabot.prompt)}
                  onStop={metabot.cancelRequest}
                  suggestionConfig={{
                    suggestionModels: config.suggestionModels,
                  }}
                />
              </Paper>
            )}
          </Box>
          <Box className={Styles.footerRow}>
            <Text fz="sm" c="text-disabled" ta="center">
              {t`${metabotName} isn't perfect. Double-check results.`}
            </Text>
            {metabot.contextWindowPercentUsage > 50 &&
              !metabot.isContextWindowFull && (
                <MetabotContextUsageRing
                  className={Styles.contextUsage}
                  percentUsage={metabot.contextWindowPercentUsage}
                />
              )}
          </Box>
        </Box>
      )}
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};
