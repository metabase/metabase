import cx from "classnames";
import { useMemo } from "react";
import { c, jt, t } from "ttag";
import _ from "underscore";

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
  Textarea,
  UnstyledButton,
} from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";

import { useMetabotAgent } from "../../hooks";

import Styles from "./MetabotChat.module.css";
import { AgentErrorMessage, Message } from "./MetabotChatMessage";
import { MetabotThinking } from "./MetabotThinking";
import { useScrollManager } from "./hooks";

export const MetabotChat = () => {
  const metabot = useMetabotAgent();

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

  const handleSubmitInput = (input: string) => {
    if (metabot.isDoingScience) {
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput.length || metabot.isDoingScience) {
      return;
    }
    metabot.setPrompt("");
    metabot.promptInputRef?.current?.focus();
    metabot.submitInput(trimmedInput).catch((err) => console.error(err));
  };

  const handleRetryMessage = (messageId: string) => {
    if (metabot.isDoingScience) {
      return;
    }

    metabot.setPrompt("");
    metabot.promptInputRef?.current?.focus();
    metabot.retryMessage(messageId).catch((err) => console.error(err));
  };

  const handleClose = () => {
    metabot.setPrompt("");
    metabot.setVisible(false);
  };

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
              {t`Metabot isn't perfect. Double-check results.`}
            </Text>
          </Flex>

          <Flex gap="sm">
            <ActionIcon
              onClick={() => metabot.resetConversation()}
              data-testid="metabot-reset-chat"
            >
              <Icon c="text-primary" name="revert" />
            </ActionIcon>
            <ActionIcon onClick={handleClose} data-testid="metabot-close-chat">
              <Icon c="text-primary" name="close" />
            </ActionIcon>
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
                <Text
                  c="text-light"
                  maw="12rem"
                  ta="center"
                >{t`I can help you explore your metrics and models.`}</Text>
              </Flex>
              {/* empty state with suggested prompts */}
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
            </>
          )}

          {(hasMessages || metabot.isDoingScience) && (
            <Box
              className={Styles.messages}
              data-testid="metabot-chat-inner-messages"
            >
              {/* conversation messages */}
              {metabot.messages.map((message, index) => {
                const canRetry =
                  metabot.useStreaming &&
                  message.role === "agent" &&
                  metabot.messages[index + 1]?.role !== "agent";

                return (
                  <Message
                    key={"msg-" + index}
                    data-testid="metabot-chat-message"
                    message={message}
                    onRetry={canRetry ? handleRetryMessage : undefined}
                    hideActions={
                      metabot.isDoingScience &&
                      metabot.messages.length === index + 1 &&
                      message.role === "agent"
                    }
                  />
                );
              })}

              {/* error messages */}
              {metabot.errorMessages.map((message, index) => (
                <AgentErrorMessage
                  key={"err-" + index}
                  data-testid="metabot-chat-message"
                  message={message}
                />
              ))}

              {/* loading */}
              {metabot.isDoingScience && (
                <MetabotThinking
                  toolCalls={metabot.useStreaming ? metabot.toolCalls : []}
                  hideLoader={
                    metabot.useStreaming &&
                    _.last(metabot.messages)?.role === "agent"
                  }
                />
              )}

              {/* filler - height gets set via ref mutation */}
              <div ref={fillerRef} data-testid="metabot-message-filler" />

              {/* long convo warning */}
              {metabot.isLongConversation && (
                <Text lh={1} c="text-light" m={0} ta="center">
                  {jt`This chat is getting long. You can ${(
                    <UnstyledButton
                      key="reset"
                      data-testid="metabot-reset-long-chat"
                      display="inline"
                      c="brand"
                      td="underline"
                      onClick={() => metabot.resetConversation()}
                    >{c("'it' refers to a chat with an AI agent")
                      .t`clear it`}</UnstyledButton>
                  )}.`}
                </Text>
              )}
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
            <Textarea
              id="metabot-chat-input"
              data-testid="metabot-chat-input"
              w="100%"
              leftSection={
                <Box h="100%" pt="11px" onDoubleClick={metabot.toggleStreaming}>
                  <Icon
                    name="metabot"
                    c={metabot.useStreaming ? "brand" : "warning"}
                  />
                </Box>
              }
              autosize
              minRows={1}
              maxRows={10}
              ref={metabot.promptInputRef}
              autoFocus
              value={metabot.prompt}
              className={cx(
                Styles.textarea,
                metabot.isDoingScience && Styles.textareaLoading,
              )}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={(e) => metabot.setPrompt(e.target.value)}
              onKeyDown={(e) => {
                const isModifiedKeyPress =
                  e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
                if (e.key === "Enter" && !isModifiedKeyPress) {
                  // prevent event from inserting new line + interacting with other content
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitInput(metabot.prompt);
                }
              }}
            />
          </Paper>
        </Box>
      </Box>
    </Sidebar>
  );
};
