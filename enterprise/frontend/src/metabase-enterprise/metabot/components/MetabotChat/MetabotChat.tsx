import { useClipboard, useTimeout } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { c, jt, t } from "ttag";
import _ from "underscore";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg?component";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import {
  ActionIcon,
  Alert,
  Box,
  type BoxProps,
  Button,
  Flex,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import type { MetabotChatMessage } from "metabase-enterprise/metabot/state";

import { useMetabotAgent } from "../../hooks";
import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import Styles from "./MetabotChat.module.css";
import { useAutoscrollMessages } from "./hooks";
import { isLastAgentReply } from "./utils";

export const MetabotChat = () => {
  const messagesRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const metabot = useMetabotAgent();

  useAutoscrollMessages(headerRef, messagesRef, metabot.messages);

  const hasMessages = metabot.messages.length > 0;

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
        <Box
          data-testid="metabot-chat-header"
          className={Styles.header}
          ref={headerRef}
        >
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
          className={Styles.messagesContainer}
          data-testid="metabot-chat-messages"
          ref={messagesRef}
        >
          {/* empty state with no suggested prompts */}
          {!hasMessages && (
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
          )}

          {/* empty state with suggested prompts */}
          {!hasMessages && (
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
                    >
                      {prompt}
                    </Button>
                  </Box>
                ))}
              </>
            </Stack>
          )}

          {(hasMessages || metabot.isDoingScience) && (
            <Box className={Styles.messages}>
              {/* conversation messages */}
              {metabot.messages.map((message, index) => {
                const canRetry =
                  metabot.useStreaming &&
                  isLastAgentReply(message, metabot.messages[index + 1]);

                return (
                  <Message
                    key={index}
                    data-testid="metabot-chat-message"
                    message={message}
                    onRetry={canRetry ? handleRetryMessage : undefined}
                  />
                );
              })}

              {/* loading */}
              {metabot.isDoingScience && (
                <Thinking
                  activeToolCallName={metabot.activeToolCall?.name}
                  useStreaming={metabot.useStreaming}
                />
              )}

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
                <Box
                  h="100%"
                  pt="11px"
                  onDoubleClick={() => metabot.toggleStreaming()}
                >
                  <Icon
                    name="metabot"
                    c={metabot.useStreaming ? "warning" : "brand"}
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

const Message = ({
  message,
  className,
  onRetry,
  ...props
}: BoxProps & {
  message: MetabotChatMessage;
  onRetry?: (messageId: string) => void;
}) => {
  const clipboard = useClipboard();

  return (
    <Flex
      className={cx(
        Styles.messageContainer,
        message.role === "user"
          ? Styles.messageContainerUser
          : Styles.messageContainerAgent,
        className,
      )}
      data-message-role={message.role}
      direction="column"
      {...props}
    >
      {match(message)
        .with({ role: "user" }, () => (
          <Text
            className={cx(
              Styles.message,
              message.role === "user" && Styles.messageUser,
            )}
          >
            {message.message}
          </Text>
        ))
        .with({ role: "agent", type: "error" }, () => (
          <Alert color="error" icon={<Icon name="warning" />} mt="sm">
            <AIMarkdown className={Styles.message}>
              {message.message}
            </AIMarkdown>
          </Alert>
        ))
        .with({ role: "agent", type: "reply" }, () => (
          <AIMarkdown className={Styles.message}>{message.message}</AIMarkdown>
        ))
        .exhaustive()}
      <Flex className={Styles.messageActions}>
        {!(message.role === "agent" && message.type === "error") && (
          <ActionIcon
            onClick={() => clipboard.copy(message.message)}
            h="sm"
            data-testid="metabot-chat-message-copy"
          >
            <Icon name="copy" size="1rem" />
          </ActionIcon>
        )}
        {onRetry && (
          <ActionIcon
            onClick={() => onRetry(message.id)}
            h="sm"
            data-testid="metabot-chat-message-retry"
          >
            <Icon name="revert" size="1rem" />
          </ActionIcon>
        )}
      </Flex>
    </Flex>
  );
};

const Thinking = ({
  activeToolCallName,
  useStreaming,
}: {
  activeToolCallName: string | undefined;
  useStreaming: boolean;
}) => {
  const [defaultMessageKey, setDefaultMessageKey] = useState<string>("");
  useTimeout(() => setDefaultMessageKey("__SLOW_RESPONSE__"), 3000, {
    autoInvoke: true,
  });
  useTimeout(() => setDefaultMessageKey("__VERY_SLOW_RESPONSE__"), 10000, {
    autoInvoke: true,
  });

  const messagesKey = activeToolCallName ?? defaultMessageKey;

  const messages = {
    __SLOW_RESPONSE__: [t`Thinking...`, t`Working on your request`],
    __VERY_SLOW_RESPONSE__: [
      t`Lot's to consider`,
      t`Working through the details...`,
    ],
    construct_notebook_query: [t`Creating a query`, t`Contructing a question`],
    analyze_data: [t`Analyzing the data`, t`Exploring your data`],
    analyze_chart: [t`Inspecting the visualization`, t`Looking at the data`],
    list_available_fields: undefined, // tool executes near instantly
  } as Record<string, string[] | undefined>;

  const message = _.sample(
    messages[messagesKey] ?? messages[defaultMessageKey] ?? [],
  );

  return (
    <Flex gap="md" align="center">
      <Loader
        color="brand"
        type="dots"
        size="lg"
        data-testid="metabot-response-loader"
      />
      {useStreaming && message && <Text c="text-light">{message}</Text>}
    </Flex>
  );
};
