import cx from "classnames";
import type { LegacyRef } from "react";
import { t } from "ttag";

import {
  Flex,
  Icon,
  Loader,
  Menu,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQuestion.module.css";

export function MetabotChatInput() {
  const metabot = useMetabotAgent();

  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : t`Ask AI a question...`;

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
          <Icon name="ai" c="brand" size="1rem" />
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
            metabot.submitInput(metabot.prompt, { focusInput: true });
          }
        }}
      />

      <Flex align="center" justify="center" gap="xs">
        {metabot.isDoingScience && (
          <UnstyledButton
            onClick={metabot.cancelRequest}
            className={cx(S.chatButton, S.stopGenerationButton)}
          >
            <Tooltip label={t`Stop generation`}>
              <Icon name="stop" c="text-secondary" />
            </Tooltip>
          </UnstyledButton>
        )}

        {!metabot.isDoingScience && metabot.prompt.length > 0 && (
          <UnstyledButton
            onClick={() => metabot.setPrompt("")}
            data-testid="metabot-close-chat"
            className={S.chatButton}
          >
            <Icon name="close" c="text-secondary" />
          </UnstyledButton>
        )}

        {/* Overflow menu - only shown in stacked layout and auto layout mobile */}
        <Menu position="top-end" withinPortal>
          <Menu.Target>
            <UnstyledButton
              data-testid="metabot-overflow-button"
              className={S.stackedOverflowButton}
            >
              <Icon name="ellipsis" c="text-secondary" />
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="edit_document_outlined" size="1rem" />}
              onClick={metabot.resetConversation}
            >
              {t`Start new chat`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
    </Flex>
  );
}
