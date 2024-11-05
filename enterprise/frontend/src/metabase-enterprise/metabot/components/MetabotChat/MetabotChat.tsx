import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Icon, Textarea, UnstyledButton } from "metabase/ui";

import { useMetabotAgent } from "../../hooks";
import { MetabotIcon } from "../MetabotIcon";

import Styles from "./MetabotChat.module.css";

const MIN_INPUT_HEIGHT = 42;
const ANIMATION_DURATION_MS = 300;

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState("");

  const metabot = useMetabotAgent();
  const isDoingScience = metabot.isLoading || metabot.isProcessing;

  const resetInput = () => {
    setMessage("");
    setInputExpanded(false);
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage.length || isDoingScience) {
      return;
    }
    resetInput();
    metabot
      .submitInput(trimmedMessage)
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

  const inputPlaceholder = metabot.confirmationOptions
    ? Object.keys(metabot.confirmationOptions).join(" or ")
    : t`Tell me to do something, or ask a question`;
  const placeholder = isDoingScience ? t`Doing science...` : inputPlaceholder;

  return (
    <Box
      className={Styles.container}
      style={{ animationDuration: `${ANIMATION_DURATION_MS}ms` }}
    >
      {metabot.userMessages.length > 0 && (
        <Box className={Styles.responses}>
          {metabot.userMessages.map((msg, index) => (
            <Box className={Styles.response} key={msg}>
              <Box>{msg}</Box>
              <UnstyledButton
                className={Styles.responseDismissBtn}
                onClick={() => metabot.dismissUserMessage(index)}
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
          isDoingScience && Styles.innerContainerLoading,
          inputExpanded && Styles.innerContainerExpanded,
        )}
        gap="sm"
      >
        <Box w="33px" h="24px">
          <MetabotIcon isLoading={isDoingScience} />
        </Box>
        <Textarea
          w="100%"
          autosize
          minRows={1}
          maxRows={4}
          ref={textareaRef}
          value={message}
          disabled={isDoingScience}
          className={cx(
            Styles.textarea,
            inputExpanded && Styles.textareaExpanded,
            isDoingScience && Styles.textareaLoading,
          )}
          placeholder={placeholder}
          onChange={e => handleInputChange(e.target.value)}
          // @ts-expect-error - undocumented API for mantine Textarea - leverages the prop from react-textarea-autosize's TextareaAutosize component
          onHeightChange={handleMaybeExpandInput}
          onKeyDown={e => {
            if (e.key === "Enter") {
              // prevent event from inserting new line + interacting with other content
              e.preventDefault();
              e.stopPropagation();
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
