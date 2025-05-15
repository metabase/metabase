import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { jt, t } from "ttag";

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
import { useIsScrollable } from "./hooks";
import { testMarkdown } from "./utils";

const MIN_INPUT_HEIGHT = 42;

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isMessagesScrollable = useIsScrollable(messagesRef);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const resetInput = useCallback(() => {
    setMessage("");
    setInputExpanded(false);
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

  const handleClose = useCallback(() => {
    resetInput();
    onClose();
  }, [resetInput, onClose]);

  const [inputExpanded, setInputExpanded] = useState(false);
  const handleMaybeExpandInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const isMultiRow = textarea.scrollHeight > MIN_INPUT_HEIGHT;
    if (inputExpanded !== isMultiRow) {
      setInputExpanded(isMultiRow);
    }
    // keep scrolled to bottom
    textarea.scrollTop = Math.max(MIN_INPUT_HEIGHT, textarea.scrollHeight);
  };

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
            <ActionIcon onClick={() => metabot.setVisible(false)}>
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
            {metabot.messages.length === 0 &&
              !metabot.suggestedPrompts.error && (
                <Stack gap="sm">
                  <>
                    <Text c="text-light">{t`Try asking a question about a model or a metric, like these.`}</Text>
                    {metabot.suggestedPrompts.isLoading && <Loader />}
                    {metabot.suggestedPrompts.data?.prompts.map(
                      ({ prompt }, index) => (
                        <Box key={index}>
                          <Button
                            fz="sm"
                            size="xs"
                            onClick={() => handleSubmitInput(prompt)}
                          >
                            {prompt}
                          </Button>
                        </Box>
                      ),
                    )}
                  </>
                </Stack>
              )}

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

        <Box px="md" py="md">
          <Paper
            className={cx(
              Styles.inputContainer,
              metabot.isDoingScience && Styles.inputContainerLoading,
              inputExpanded && Styles.inputContainerExpanded,
            )}
            withBorder
          >
            <Textarea
              data-testid="metabot-chat-input"
              w="100%"
              autosize
              minRows={1}
              maxRows={4}
              ref={textareaRef}
              autoFocus
              value={input}
              disabled={metabot.isDoingScience}
              className={cx(
                Styles.textarea,
                inputExpanded && Styles.textareaExpanded,
                metabot.isDoingScience && Styles.textareaLoading,
              )}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={(e) => handleInputChange(e.target.value)}
              // @ts-expect-error - undocumented API for mantine Textarea - leverages the prop from react-textarea-autosize's TextareaAutosize component
              onHeightChange={handleMaybeExpandInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // prevent event from inserting new line + interacting with other content
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitInput(input);
                }
              }}
            />
            <UnstyledButton
              h="1rem"
              onClick={handleClose}
              data-testid="metabot-close-chat"
            >
              <Icon name="close" c="text-light" size="1rem" />
            </UnstyledButton>
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
