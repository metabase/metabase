import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { c, jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg?component";
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
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";

import { useMetabotAgent } from "../../hooks";
import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import Styles from "./MetabotChat.module.css";
import { useAutoscrollMessages } from "./hooks";

export const MetabotChat = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [input, setMessage] = useState("");

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
    setMessage("");
    textareaRef.current?.focus();
    metabot.submitInput(trimmedInput).catch((err) => console.error(err));
  };

  const { setVisible } = metabot;
  const handleClose = useCallback(() => {
    setMessage("");
    setVisible(false);
  }, [setVisible]);

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
              {metabot.messages.map(({ actor, message }, index) => (
                <Message
                  key={index}
                  data-testid="metabot-chat-message"
                  actor={actor}
                  message={message}
                />
              ))}

              {/* loading */}
              {metabot.isDoingScience && (
                <Loader
                  color="brand"
                  type="dots"
                  size="lg"
                  data-testid="metabot-response-loader"
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
              data-testid="metabot-chat-input"
              w="100%"
              leftSection={
                <Box h="100%" pt="11px">
                  <Icon name="metabot" c="brand" />
                </Box>
              }
              autosize
              minRows={1}
              maxRows={10}
              ref={textareaRef}
              autoFocus
              value={input}
              className={cx(
                Styles.textarea,
                metabot.isDoingScience && Styles.textareaLoading,
              )}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                const isModifiedKeyPress =
                  e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
                if (e.key === "Enter" && !isModifiedKeyPress) {
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
        actor === "user"
          ? Styles.messageContainerUser
          : Styles.messageContainerAgent,
        className,
      )}
      data-message-actor={actor}
      direction="column"
      {...props}
    >
      {actor === "user" ? (
        <Text
          className={cx(Styles.message, actor === "user" && Styles.messageUser)}
        >
          {message}
        </Text>
      ) : (
        <AIMarkdown className={Styles.message}>{message}</AIMarkdown>
      )}
      <Flex className={Styles.messageActions}>
        <ActionIcon onClick={() => clipboard.copy(message)} h="sm">
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
    </Flex>
  );
};
