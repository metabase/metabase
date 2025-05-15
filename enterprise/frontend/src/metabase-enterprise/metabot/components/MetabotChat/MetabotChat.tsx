import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { jt, t } from "ttag";

import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import {
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

const MIN_INPUT_HEIGHT = 42;

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const resetInput = useCallback(() => {
    setMessage("");
    setInputExpanded(false);
  }, []);

  // TODO: i don't like the override, just trying to get this out quick..
  // there's a problem where setting the value and sending in in the same
  // function results in the current value being stale as rerender hasn't happend
  // this this function to have the correct value in scope
  const handleSend = (inputOverride?: string) => {
    const trimmedInput = (inputOverride ?? input).trim();
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

  // TODO: think throug this a bit more... look at what other chat UIs are doing
  useEffect(
    function autoScrollToBottom() {
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
        <Box className={Styles.header} data-testid="metabot-chat-header">
          <Text fz="xl" fw="bold">{t`Metabot Chat`}</Text>
          <Flex gap="md">
            <UnstyledButton
              c="text-light"
              onClick={() => metabot.resetConversation()}
              h="md"
            >
              <Icon name="trash" size="1rem" />
            </UnstyledButton>

            <UnstyledButton
              c="text-light"
              onClick={() => metabot.setVisible(false)}
              h="md"
            >
              <Icon name="close" size="1rem" />
            </UnstyledButton>
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
                            onClick={() => handleSend(prompt)}
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
            {metabot.isDoingScience && (
              <Message
                key="thinkin"
                data-testid="metabot-chat-message-thinking"
                actor="agent"
                message="Thinking..."
                copyable={false}
                shimmer
              />
            )}
          </Box>
        </Box>

        {/* conversation status container */}
        <Box className={Styles.conversationStatusContainer}>
          <Box w="33px" h="24px">
            <MetabotIcon isLoading={metabot.isDoingScience} />
          </Box>

          {metabot.messages.length > 0 && metabot.isDoingScience === false && (
            <Text fz="sm" c="text-light">
              {t`Metabot isn't perfect. Double-check results.`}
            </Text>
          )}
        </Box>

        {metabot.isLongConversation && (
          <Text c="text-light" my="xs" ta="center">
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

        <Box p="md">
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
                  handleSend();
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
  copyable = true,
  shimmer,
  ...props
}: BoxProps & {
  actor: "agent" | "user";
  message: string;
  copyable?: boolean;
  shimmer?: boolean;
}) => {
  const clipboard = useClipboard();

  return (
    <Box
      className={cx(
        Styles.message,
        actor === "agent" ? Styles.messageAgent : Styles.messageUser,
        className,
      )}
      {...props}
    >
      <Box className={cx(shimmer && Styles.textShimmer)}>{message}</Box>
      {copyable && (
        <Flex justify="flex-end">
          <UnstyledButton onClick={() => clipboard.copy(message)} h="md">
            <Icon name="copy" size="1rem" />
          </UnstyledButton>
        </Flex>
      )}
    </Box>
  );
};
