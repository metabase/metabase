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
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import { useMetabotAgent } from "../../hooks";
import { MetabotIcon } from "../MetabotIcon";

import Styles from "./MetabotChat.module.css";
import { useIsScrollable } from "./hooks";
import { testMarkdown } from "./utils";

export const MetabotChat = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isMessagesScrollable = useIsScrollable(messagesRef);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const hasMessages = metabot.messages.length > 0;
  const suggestedPrompts = metabot.suggestedPrompts.data?.prompts ?? [
    { prompt: "Sales totals by week" },
    { prompt: "Top 10 customers by number of orders" },
    { prompt: "Country distribution of customers" },
  ];
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
      .finally(() => inputRef.current?.focus());
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
        <Box
          data-testid="metabot-chat-header"
          className={cx(
            Styles.header,
            isMessagesScrollable && Styles.headerWithScrollContent,
          )}
        >
          <Text fz="lg" fw="bold">{t`Ask Metabot`}</Text>
          <Flex gap="sm">
            <ActionIcon onClick={() => metabot.resetConversation()}>
              <Icon c="text-primary" name="refresh" />
            </ActionIcon>
            <ActionIcon onClick={handleClose}>
              <Icon c="text-primary" name="close" />
            </ActionIcon>
          </Flex>
        </Box>

        {/* chat messages - TODO: rename the container css class */}
        <Box
          className={Styles.messagesContainer}
          ref={messagesRef}
          data-testid="metabot-chat-messages"
        >
          <Box className={Styles.messages}>
            {/* empty state with no sugggested prompts */}
            {!hasMessages && !hasSuggestions && (
              <Flex h="100%" direction="column" align="center" justify="center">
                <Box
                  component="img"
                  src={EmptyDashboardBot}
                  w="6rem"
                  alt={t`Empty metabot conversation`}
                />
                <Text
                  c="text-light"
                  maw="19rem"
                  ta="center"
                >{t`I can tell you about what you’re looking at, or help you explore your models and metrics. empty state`}</Text>
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

            {/* conversation messages */}
            {metabot.messages.map(({ actor, message }, index) => (
              <Message
                key={index}
                data-testid="metabot-chat-message"
                actor={actor}
                message={message}
              />
            ))}

            {/* TODO: remove */}
            {false && <Message actor="agent" message={testMarkdown} />}
          </Box>
        </Box>

        {/* conversation status container */}
        {(hasMessages || hasSuggestions) && (
          <Box className={Styles.conversationStatusContainer}>
            {metabot.isDoingScience && (
              <Text className={Styles.thinkingText}>{t`Thinking...`}</Text>
            )}

            <Flex justify="space-between" align-items="center">
              <MetabotIcon
                width="40px"
                height="30px"
                isLoading={metabot.isDoingScience}
              />

              {metabot.messages.length > 0 && (
                <Text fz="sm" c="text-light">
                  {t`Metabot isn't perfect. Double-check results.`}
                </Text>
              )}
            </Flex>
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

        <Box px="md" my="md">
          <TextInput
            data-testid="metabot-chat-input"
            className={Styles.input}
            autoFocus
            value={input}
            ref={inputRef}
            disabled={metabot.isDoingScience}
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
        </Box>
      </Box>
    </Sidebar>
  );
};

const Message = ({
  actor,
  message,
  className,
  ...props
}: BoxProps & {
  actor: "agent" | "user";
  message: string;
}) => {
  const clipboard = useClipboard();

  return (
    <Flex
      className={cx(
        Styles.messageContainer,
        actor === "user" && Styles.messageContainerUser,
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
      <ActionIcon onClick={() => clipboard.copy(message)} h="md">
        <Icon name="copy" size="1rem" />
      </ActionIcon>
    </Flex>
  );
};
