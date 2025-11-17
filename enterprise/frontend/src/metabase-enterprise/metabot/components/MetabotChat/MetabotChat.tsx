import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg?component";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
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
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { MetabotResetLongChatButton } from "metabase-enterprise/metabot/components/MetabotChat/MetabotResetLongChatButton";

import { useMetabotAgent, useMetabotChatHandlers } from "../../hooks";
import type { MetabotConfig } from "../Metabot";

import Styles from "./MetabotChat.module.css";
import { MetabotChatEditor } from "./MetabotChatEditor";
import { Messages } from "./MetabotChatMessage";
import { MetabotThinking } from "./MetabotThinking";
import { useScrollManager } from "./hooks";

const defaultConfig: MetabotConfig = {
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
}: {
  config?: MetabotConfig;
}) => {
  const metabot = useMetabotAgent();
  const { handleSubmitInput, handleRetryMessage, handleResetInput } =
    useMetabotChatHandlers(config);

  const hasMessages =
    metabot.messages.length > 0 || metabot.errorMessages.length > 0;

  const { scrollContainerRef, headerRef, fillerRef } =
    useScrollManager(hasMessages);

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.metabotId,
    limit: 3,
    sample: true,
  });
  const suggestedPrompts = useMemo(() => {
    return suggestedPromptsReq.currentData?.prompts ?? [];
  }, [suggestedPromptsReq.currentData?.prompts]);

  const handleClose = () => {
    handleResetInput();
    metabot.setVisible(false);
  };

  const handleEditorChange = useCallback(
    (value: string) => metabot.setPrompt(value),
    [metabot],
  );

  const handleEditorSubmit = useCallback(() => {
    handleSubmitInput(metabot.prompt);
  }, [handleSubmitInput, metabot.prompt]);

  return (
    <Sidebar
      isOpen={metabot.visible}
      side="right"
      width="30rem"
      aria-hidden={!metabot.visible}
    >
      <Box className={Styles.container} data-testid="metabot-chat">
        {/* header */}
        <Box ref={headerRef} className={Styles.header}>
          <Flex align-items="center">
            <Text lh={1} fz="sm" c="text-secondary">
              {metabot.profileOverride
                ? t`Using profile: ${metabot.profileOverride}`
                : t`Metabot isn't perfect. Double-check results.`}
            </Text>
          </Flex>

          <Flex gap="sm">
            <Tooltip label={t`Clear conversation`} position="bottom">
              <ActionIcon
                onClick={() => metabot.resetConversation()}
                data-testid="metabot-reset-chat"
              >
                <Icon c="text-primary" name="revert" />
              </ActionIcon>
            </Tooltip>
            {!config.preventClose && (
              <ActionIcon
                onClick={handleClose}
                data-testid="metabot-close-chat"
              >
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
                <Box component={EmptyDashboardBot} w="6rem" />
                <Text c="text-disabled" maw="12rem" ta="center">
                  {config.emptyText ??
                    t`I can help you explore your metrics and models.`}
                </Text>
              </Flex>
              {!config.hideSuggestedPrompts && (
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
                          onClick={() => handleSubmitInput(prompt)}
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
                errorMessages={metabot.errorMessages}
                onRetryMessage={handleRetryMessage}
                isDoingScience={metabot.isDoingScience}
                showFeedbackButtons
              />
              {/* loading */}
              {metabot.isDoingScience && (
                <MetabotThinking toolCalls={metabot.activeToolCalls} />
              )}
              {/* filler - height gets set via ref mutation */}
              <div ref={fillerRef} data-testid="metabot-message-filler" />
              {/* long convo warning */}
              {metabot.isLongConversation && <MetabotResetLongChatButton />}
            </Box>
          )}
        </Box>

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
              disabled={metabot.isDoingScience}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={handleEditorChange}
              onSubmit={handleEditorSubmit}
              suggestionModels={config.suggestionModels}
            />
          </Paper>
        </Box>
      </Box>
    </Sidebar>
  );
};
