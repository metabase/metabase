import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useSdkDispatch } from "embedding-sdk/store";
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
import { METABOT_RESULTS_MESSAGE } from "metabase-enterprise/metabot/constants";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import { resetConversationId } from "metabase-enterprise/metabot/state";

import Styles from "./MetabotChatEmbedding.module.css";

const MIN_INPUT_HEIGHT = 42;

interface MetabotChatEmbeddingProps {
  onRedirectUrl: (result: string) => void;
  onMessages: (messages: string[]) => void;
}

const EMBEDDING_METABOT_ID = "c61bf5f5-1025-47b6-9298-bf1827105bb6";

export const MetabotChatEmbedding = ({
  onRedirectUrl,
  onMessages,
}: MetabotChatEmbeddingProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setMessage] = useState("");

  const metabot = useMetabotAgent();

  const resetInput = useCallback(() => {
    setMessage("");
    setInputExpanded(false);
  }, []);

  const metabotRequestPromiseRef = useRef<{ abort: () => void } | null>(null);

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput.length || metabot.isDoingScience) {
      return;
    }
    setMessage("");
    const metabotRequestPromise = metabot.submitInput(
      trimmedInput,
      EMBEDDING_METABOT_ID,
    );
    metabotRequestPromiseRef.current = metabotRequestPromise;

    metabotRequestPromise
      .then((result) => {
        const redirectUrl = (
          result.payload as any
        )?.payload?.data?.reactions?.find(
          (reaction: { type: string; url: string }) =>
            reaction.type === "metabot.reaction/redirect",
        )?.url;
        if (redirectUrl) {
          onRedirectUrl(redirectUrl);
        }
      })
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
    metabotRequestPromiseRef.current?.abort();
  }

  const dispatch = useSdkDispatch();
  useEffect(() => {
    dispatch(resetConversationId());
  }, [dispatch]);

  useEffect(() => {
    const normalizedMessages = metabot.lastAgentMessages.filter(
      (message) => message !== METABOT_RESULTS_MESSAGE,
    );
    onMessages(normalizedMessages);
  }, [metabot.lastAgentMessages, onMessages]);

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
