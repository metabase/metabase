import cx from "classnames";
import type { LegacyRef } from "react";
import { t } from "ttag";

import { useSdkDispatch } from "embedding-sdk-bundle/store";
import {
  Flex,
  Icon,
  Loader,
  Menu,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { cancelInflightAgentRequests } from "metabase-enterprise/metabot/state";

import S from "./MetabotQuestion.module.css";

export function MetabotChatInput() {
  const metabot = useMetabotAgent();
  const { handleSubmitInput, handleResetInput } = useMetabotChatHandlers();
  const dispatch = useSdkDispatch();

  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : t`Ask AI a question...`;

  const cancelRequest = () => {
    dispatch(cancelInflightAgentRequests());
  };

  const resetInput = () => {
    handleResetInput();
  };

  const startNewConversation = () => {
    metabot.resetConversation();
  };

  return (
    <Flex
      gap="xs"
      px="md"
      align="center"
      justify="center"
      style={{ borderTop: "1px solid var(--mb-color-border)" }}
    >
      <Flex justify="center" align="center" style={{ flexShrink: 0 }}>
        {metabot.isDoingScience ? (
          <Loader size="sm" />
        ) : (
          <Icon name="ai" c="var(--mb-color-brand)" size="1rem" />
        )}
      </Flex>

      <Textarea
        id="metabot-chat-input"
        data-testid="metabot-chat-input"
        w="100%"
        pb="0.2rem"
        pt="0.6rem"
        autosize
        minRows={1}
        maxRows={4}
        ref={metabot.promptInputRef as LegacyRef<HTMLTextAreaElement>}
        autoFocus
        value={metabot.prompt}
        disabled={metabot.isDoingScience}
        placeholder={placeholder}
        onChange={(e) => metabot.setPrompt(e.target.value)}
        classNames={{ input: S.chatInput }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }

          const isModifiedKeyPress =
            e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;

          // Prevent event from inserting new line and interacting with other content
          if (e.key === "Enter" && !isModifiedKeyPress) {
            e.preventDefault();
            e.stopPropagation();
            handleSubmitInput(metabot.prompt);
          }
        }}
      />

      <Flex align="center" justify="center" gap="xs">
        {metabot.isDoingScience && (
          <UnstyledButton
            onClick={cancelRequest}
            className={cx(S.chatButton, S.stopGenerationButton)}
          >
            <Tooltip label={t`Stop generation`}>
              <Icon name="stop" c="var(--mb-color-text-secondary)" />
            </Tooltip>
          </UnstyledButton>
        )}

        {!metabot.isDoingScience && metabot.prompt.length > 0 && (
          <UnstyledButton
            onClick={resetInput}
            data-testid="metabot-close-chat"
            className={S.chatButton}
          >
            <Icon name="close" c="var(--mb-color-text-secondary)" />
          </UnstyledButton>
        )}

        {/* Overflow menu - only shown in stacked layout and auto layout mobile */}
        <Menu position="top-end" withinPortal>
          <Menu.Target>
            <UnstyledButton
              data-testid="metabot-overflow-button"
              className={S.stackedOverflowButton}
            >
              <Icon name="ellipsis" c="var(--mb-color-text-secondary)" />
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="edit_document_outlined" size="1rem" />}
              onClick={startNewConversation}
            >
              {t`Start new chat`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
    </Flex>
  );
}
