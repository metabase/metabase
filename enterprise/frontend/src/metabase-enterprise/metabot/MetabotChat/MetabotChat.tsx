import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Icon, Textarea, UnstyledButton } from "metabase/ui";

import { MetabotIcon } from "../MetabotIcon";
import { useMetabotAgent } from "../hooks";

import Styles from "./MetabotChat.module.css";

const MIN_INPUT_HEIGHT = 42;
const ANIMATION_DURATION_MS = 300;

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState("");

  const { userMessages, removeUserMessage, sendMessage, sendMessageReq } =
    useMetabotAgent();
  const { isLoading } = sendMessageReq;

  const resetInput = () => {
    setMessage("");
    setInputExpanded(false);
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage.length || isLoading) {
      return;
    }
    resetInput();
    sendMessage(trimmedMessage)
      .catch(err => console.error(err))
      .finally(() => textareaRef.current?.focus());
  };

  const handleClose = () => {
    resetInput();
    onClose();
  };

  // auto-focus once animation in completes
  // doing it too early will cause the page to shift down
  useEffect(() => {
    const timeout = setTimeout(() => {
      textareaRef.current?.focus();
    }, ANIMATION_DURATION_MS);
    return () => clearTimeout(timeout);
  }, []);

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

  const handleInputChange = (value: string) => {
    setMessage(value);
  };

  return (
    <Box
      className={Styles.container}
      style={{ animationDuration: `${ANIMATION_DURATION_MS}ms` }}
    >
      {userMessages.length > 0 && (
        <Box className={Styles.responses}>
          {userMessages.map((msg, index) => (
            <Box className={Styles.response} key={msg}>
              <Box>{msg}</Box>
              <UnstyledButton
                className={Styles.responseDismissBtn}
                onClick={() => removeUserMessage(index)}
              >
                <Icon name="close" size="1rem" />
              </UnstyledButton>
            </Box>
          ))}
        </Box>
      )}
      <Flex
        className={cx(
          Styles.innerContainer,
          isLoading && Styles.innerContainerLoading,
          inputExpanded && Styles.innerContainerExpanded,
        )}
        gap="sm"
      >
        <Box w="33px" h="24px">
          <MetabotIcon isLoading={isLoading} />
        </Box>
        <Textarea
          w="100%"
          autosize
          minRows={1}
          maxRows={4}
          ref={textareaRef}
          value={message}
          disabled={isLoading}
          className={cx(
            Styles.textarea,
            inputExpanded && Styles.textareaExpanded,
            isLoading && Styles.textareaLoading,
          )}
          placeholder={
            isLoading
              ? t`Doing science...`
              : t`Tell me to do something, or ask a question`
          }
          onChange={e => handleInputChange(e.target.value)}
          // TODO: find a way to not use an undocumented api...
          // @ts-expect-error - undocumented API for mantine Textarea when using autosize
          onHeightChange={handleMaybeExpandInput}
          onKeyDown={e => {
            if (e.key === "Enter") {
              // prevent event from inserting new line
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <UnstyledButton h="1rem" onClick={handleClose}>
          <Icon name="close" c="text-light" size="1rem" />
        </UnstyledButton>
      </Flex>
    </Box>
  );
};
