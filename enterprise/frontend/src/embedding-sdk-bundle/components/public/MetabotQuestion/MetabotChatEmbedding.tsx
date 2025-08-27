import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useSdkDispatch } from "embedding-sdk-bundle/store";
import {
  Box,
  Flex,
  Icon,
  Loader,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { MetabotIcon } from "metabase-enterprise/metabot/components/MetabotIcon";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import {
  cancelInflightAgentRequests,
  resetConversationId,
} from "metabase-enterprise/metabot/state";

import Styles from "./MetabotChatEmbedding.module.css";

const MIN_INPUT_HEIGHT = 42;

export const MetabotChatEmbedding = () => {
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

    setMessage("");
    const metabotRequestPromise = metabot.submitInput(
      trimmedInput,
      metabot.metabotRequestId,
    );

    metabotRequestPromise
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

  const inputPlaceholder = t`Tell me to do something, or ask a question`;
  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : inputPlaceholder;

  function cancelRequest() {
    dispatch(cancelInflightAgentRequests());
  }

  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(resetConversationId());
  }, [dispatch]);

  return (
    <Box className={Styles.container} data-testid="metabot-chat">
      <Flex
        className={cx(
          Styles.innerContainer,
          metabot.isDoingScience && Styles.innerContainerLoading,
          inputExpanded && Styles.innerContainerExpanded,
        )}
        gap="sm"
      >
        <Flex
          w="33px"
          h="24px"
          style={{
            flexShrink: 0,
          }}
          justify="center"
        >
          {metabot.isDoingScience ? (
            <Loader size="sm" />
          ) : (
            <MetabotIcon isLoading={false} />
          )}
        </Flex>
        <Textarea
          id="metabot-chat-input"
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
            if (e.nativeEvent.isComposing) {
              return;
            }
            if (e.key === "Enter") {
              // prevent event from inserting new line + interacting with other content
              e.preventDefault();
              e.stopPropagation();
              handleSend();
            }
          }}
        />
        {metabot.isDoingScience ? (
          <UnstyledButton
            h="1rem"
            data-testid="metabot-cancel-request"
            onClick={cancelRequest}
          >
            <Tooltip label={t`Stop generation`}>
              <Icon name="stop" c="var(--mb-color-text-primary)" size="1rem" />
            </Tooltip>
          </UnstyledButton>
        ) : (
          <UnstyledButton
            h="1rem"
            onClick={resetInput}
            data-testid="metabot-close-chat"
            style={{
              visibility: input.length > 0 ? "visible" : "hidden",
            }}
          >
            <Icon name="close" c="var(--mb-color-text-primary)" size="1rem" />
          </UnstyledButton>
        )}
      </Flex>
    </Box>
  );
};
