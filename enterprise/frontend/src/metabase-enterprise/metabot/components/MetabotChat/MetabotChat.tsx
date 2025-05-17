import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import Markdown from "metabase/core/components/Markdown";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import {
  ActionIcon,
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

import { useMetabotAgent } from "../../hooks";
import { MetabotIcon } from "../MetabotIcon";

import Styles from "./MetabotChat.module.css";

export const MetabotChat = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const hasMessages = metabot.messages.length > 0;
  const suggestedPrompts = metabot.suggestedPrompts.data?.prompts ?? [];
  const hasSuggestions = suggestedPrompts.length > 0;

  const resetInput = useCallback(() => {
    setMessage("");
  }, []);

  const handleSubmitInput = (input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput.length || metabot.isDoingScience) {
      return;
    }
    resetInput();
    metabot
      .submitInput(trimmedInput)
      .catch((err) => console.error(err))
      .finally(() => textareaRef.current?.focus());
  };

  const { setVisible } = metabot;
  const handleClose = useCallback(() => {
    resetInput();
    setVisible(false);
  }, [resetInput, setVisible]);

  useEffect(
    function handleAutoscroll() {
      const el = messagesRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    },
    [metabot.messages],
  );

  const handleInputChange = (value: string) => {
    setMessage(value);
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
        <Box data-testid="metabot-chat-header" className={Styles.header}>
          <Flex gap="md" align-items="center">
            <MetabotIcon width="43px" height="32px" />
            <Stack gap="xs">
              <Text lh={1} fz="lg" fw="bold">{t`Ask Metabot`}</Text>
              <Text lh={1} fz="sm" c="text-secondary">
                {t`Metabot isn't perfect. Double-check results.`}
              </Text>
            </Stack>
          </Flex>

          <Flex gap="sm">
            <ActionIcon onClick={() => metabot.resetConversation()}>
              <Icon c="text-primary" name="revert" />
            </ActionIcon>
            <ActionIcon onClick={handleClose}>
              <Icon c="text-primary" name="close" />
            </ActionIcon>
          </Flex>
        </Box>

        {/* chat messages */}
        <Box
          className={Styles.messagesContainer}
          data-testid="metabot-chat-messages"
        >
          {/* empty state with no sugggested prompts */}
          {!hasMessages && !hasSuggestions && (
            <Flex
              h="100%"
              gap="md"
              direction="column"
              align="center"
              justify="center"
            >
              <Box
                component="img"
                src={EmptyDashboardBot}
                w="6rem"
                alt={t`Empty metabot conversation`}
              />
              <Text
                c="text-light"
                maw="18rem"
                ta="center"
              >{t`I can tell you about what you’re looking at, or help you explore your models and metrics.`}</Text>
            </Flex>
          )}

          {/* empty state with sugggested prompts */}
          {!hasMessages && hasSuggestions && (
            <Stack gap="sm">
              <>
                <Text c="text-light">{t`Try asking a question about a model or a metric, like these.`}</Text>
                {metabot.suggestedPrompts.isLoading && <Loader />}
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

          {hasMessages && (
            <Box className={Styles.messages}>
              {/* conversation messages */}
              {metabot.messages.map(({ actor, message }, index) => (
                <Message
                  key={index}
                  data-testid="metabot-chat-message"
                  actor={actor}
                  message={message}
                  isLastMessage={index === metabot.messages.length - 1}
                />
              ))}
            </Box>
          )}
        </Box>

        {metabot.isDoingScience && (
          <Box className={Styles.loadingContainer}>
            <Loader color="brand" type="dots" size="lg" />
          </Box>
        )}

        {/* long convo warning */}
        {metabot.isLongConversation && (
          <Text lh={1} c="text-light" m={0} ta="center">
            {jt`This chat is getting long. You can ${(
              <UnstyledButton
                display="inline"
                c="brand"
                td="underline"
                onClick={() => metabot.resetConversation()}
              >{t`clear it`}</UnstyledButton>
            )}.`}
          </Text>
        )}

        <Box className={Styles.textInputContainer}>
          <Paper
            className={cx(
              Styles.inputContainer,
              metabot.isDoingScience && Styles.inputContainerLoading,
            )}
          >
            <Textarea
              data-testid="metabot-chat-input"
              w="100%"
              autosize
              minRows={1}
              maxRows={10}
              ref={textareaRef}
              autoFocus
              value={input}
              disabled={metabot.isDoingScience}
              className={cx(
                Styles.textarea,
                metabot.isDoingScience && Styles.textareaLoading,
              )}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // prevent event from inserting new line + interacting with other content
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitInput(input);
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
  actor,
  message,
  className,
  isLastMessage,
  ...props
}: BoxProps & {
  actor: "agent" | "user";
  message: string;
  isLastMessage: boolean;
}) => {
  const clipboard = useClipboard();

  return (
    <Flex
      className={cx(
        Styles.messageContainer,
        actor === "user"
          ? Styles.messageContainerUser
          : Styles.messageContainerAgent,
        className,
      )}
      direction="column"
      {...props}
    >
      <Markdown
        className={cx(
          Styles.message,
          actor === "user" && Styles.messageUser,
          Styles.markdown,
        )}
      >
        {message}
      </Markdown>
      <Flex className={Styles.messageActions}>
        <ActionIcon onClick={() => clipboard.copy(message)} h="sm">
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
    </Flex>
  );
};
