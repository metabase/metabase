import cx from "classnames";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Flex,
  Icon,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { MetabotIcon } from "metabase-enterprise/metabot/components/MetabotIcon";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import Styles from "./MetabotChatEmbedding.module.css";

const MIN_INPUT_HEIGHT = 42;

interface MetabotChatEmbeddingProps {
  onResult: (result: Record<string, any> | null) => void;
}

const EMBEDDING_METABOT_ID = "c61bf5f5-1025-47b6-9298-bf1827105bb6";

export const MetabotChatEmbedding = ({
  onResult,
}: MetabotChatEmbeddingProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const resetInput = useCallback(() => {
    setMessage("");
    setInputExpanded(false);
  }, []);

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput.length || metabot.isDoingScience) {
      return;
    }
    resetInput();
    metabot
      .submitInput(trimmedInput, EMBEDDING_METABOT_ID)
      .then(onResult)
      .catch((err) => console.error(err))
      .finally(() => textareaRef.current?.focus());
  };

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
  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : inputPlaceholder;

  return (
    <Box className={Styles.container} data-testid="metabot-chat">
      {metabot.userMessages.length > 0 && (
        <Box className={Styles.responses} data-testid="metabot-chat-messages">
          {metabot.userMessages.map((msg, index) => (
            <Box
              className={Styles.response}
              key={msg}
              data-testid="metabot-chat-message"
            >
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
          metabot.isDoingScience && Styles.innerContainerLoading,
          inputExpanded && Styles.innerContainerExpanded,
        )}
        gap="sm"
      >
        <Box w="33px" h="24px">
          <MetabotIcon isLoading={metabot.isDoingScience} />
        </Box>
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
          placeholder={placeholder}
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
          data-testid="metabot-cancel-request"
          style={{
            visibility: metabot.isDoingScience ? "visible" : "hidden",
          }}
        >
          <Tooltip label={t`Stop generation`}>
            <Icon name="stop" c="var(--mb-color-text-primary)" size="1rem" />
          </Tooltip>
        </UnstyledButton>
      </Flex>
    </Box>
  );
};
