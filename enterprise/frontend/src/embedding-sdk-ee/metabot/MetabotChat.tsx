import cx from "classnames";
import type { LegacyRef } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "ttag";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { ResizeWrapper } from "embedding-sdk-bundle/components/private/ResizeWrapper";
import { METABOT_CHAT_SDK_EE_PLUGIN } from "embedding-sdk-bundle/components/public/MetabotChat/MetabotChat";
import type {
  MetabotChatProps,
  MetabotCommandBarProps,
  MetabotFloatingActionButtonProps,
} from "embedding-sdk-bundle/components/public/MetabotChat/types";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import {
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase-enterprise/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotChat.module.css";
import { metabotChatSchema } from "./MetabotChat.schema";

/**
 * Empty state shown when there are no messages yet.
 */
function ChatEmptyState() {
  return (
    <Stack h="100%" w="100%" gap="sm" align="center" justify="center">
      <Icon name="ai" c="text-tertiary" size="3rem" opacity={0.7} />

      <Stack gap="xs" align="center">
        <Text lh="sm" c="text-secondary">{t`Ask questions to AI.`}</Text>
        <Text lh="sm" c="text-secondary">{t`Results will appear here.`}</Text>
      </Stack>

      <Text lh="sm" fz="sm" c="text-tertiary">
        {t`AI isn't perfect. Double-check results.`}
      </Text>
    </Stack>
  );
}

/**
 * Chat history sub-component — renders messages and auto-scrolls.
 */
function ChatHistory() {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0 || errorMessages.length > 0;

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length, errorMessages.length, metabot.isDoingScience]);

  return (
    <Stack
      ref={scrollContainerRef}
      flex={1}
      gap={0}
      style={{ overflowY: "auto" }}
      p="md"
    >
      {hasMessages ? (
        <Messages
          messages={messages}
          errorMessages={errorMessages}
          onRetryMessage={metabot.retryMessage}
          isDoingScience={metabot.isDoingScience}
          showFeedbackButtons={false}
        />
      ) : (
        <ChatEmptyState />
      )}
      {metabot.isLongConversation && (
        <MetabotResetLongChatButton
          onResetConversation={metabot.resetConversation}
        />
      )}
    </Stack>
  );
}

/**
 * Suggested prompts sub-component.
 */
function ChatSuggestions() {
  const metabot = useMetabotAgent();

  const suggestedPromptsQuery = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.metabotId,
    limit: 3,
    sample: true,
  });

  const suggestedPrompts = suggestedPromptsQuery.currentData?.prompts ?? [];

  const shouldShowSuggestedPrompts =
    metabot.messages.length === 0 &&
    metabot.errorMessages.length === 0 &&
    !metabot.isDoingScience &&
    suggestedPrompts.length > 0;

  if (!shouldShowSuggestedPrompts) {
    return null;
  }

  return (
    <Stack gap="sm" p="md" className={S.promptSuggestionsContainer}>
      {suggestedPrompts.map(({ prompt }, index) => (
        <Button
          key={index}
          size="xs"
          variant="outline"
          fw={400}
          onClick={() => metabot.submitInput(prompt, { focusInput: true })}
          className={S.promptSuggestionButton}
          data-testid="metabot-chat-suggestion-button"
        >
          {prompt}
        </Button>
      ))}
    </Stack>
  );
}

/**
 * Chat input sub-component.
 */
function ChatInput() {
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
        autosize={false}
        rows={1}
        ref={metabot.promptInputRef as LegacyRef<HTMLTextAreaElement>}
        autoFocus
        value={metabot.prompt}
        readOnly={metabot.isDoingScience}
        placeholder={placeholder}
        onChange={(e) => metabot.setPrompt(e.target.value)}
        classNames={{ input: S.chatInput }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }

          const isModifiedKeyPress =
            e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;

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
            data-testid="metabot-chat-clear-input"
            className={S.chatButton}
          >
            <Icon name="close" c="text-secondary" />
          </UnstyledButton>
        )}

        <Menu position="top-end" withinPortal>
          <Menu.Target>
            <UnstyledButton
              data-testid="metabot-chat-overflow-button"
              className={S.chatButton}
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

/**
 * Default chat layout — history + suggestions + input.
 */
function DefaultChatLayout() {
  return (
    <>
      <ChatHistory />
      <Stack gap={0}>
        <ChatSuggestions />
        <ChatInput />
      </Stack>
    </>
  );
}

/**
 * The core MetabotChat panel.
 */
const MetabotChatInner = ({
  height,
  width,
  className,
  style,
  children,
}: MetabotChatProps) => {
  return (
    <ResizeWrapper h={height} w={width} className={className} style={style}>
      <div className={S.container} data-testid="metabot-chat-container">
        {children ?? <DefaultChatLayout />}
      </div>
    </ResizeWrapper>
  );
};

const MetabotChatWrapped = (props: MetabotChatProps) => {
  const ensureSingleInstanceId = useId();

  return (
    <EnsureSingleInstance
      groupId="metabot-chat"
      instanceId={ensureSingleInstanceId}
      multipleRegisteredInstancesWarningMessage={
        "Multiple instances of MetabotChat detected. Ensure only one instance of MetabotChat is rendered at a time."
      }
    >
      <MetabotChatInner {...props} />
    </EnsureSingleInstance>
  );
};

// Side effect: activate MetabotChat in the plugin
METABOT_CHAT_SDK_EE_PLUGIN.MetabotChat = Object.assign(
  withPublicComponentWrapper(MetabotChatWrapped, {
    supportsGuestEmbed: false,
  }),
  { schema: metabotChatSchema },
);

/**
 * FloatingActionButton trigger — Intercom-style FAB that toggles a chat panel.
 */
const FloatingActionButtonInner = ({
  className,
  style,
  panelHeight = 500,
  panelWidth = 400,
  children,
}: MetabotFloatingActionButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={className} style={style}>
      {isOpen && (
        <div
          className={S.fabPanel}
          style={{ height: panelHeight, width: panelWidth }}
        >
          <MetabotChatInner height="100%" width="100%">
            {children}
          </MetabotChatInner>
        </div>
      )}

      <UnstyledButton
        className={S.fabTrigger}
        onClick={() => setIsOpen((open) => !open)}
        data-testid="metabot-chat-fab"
        aria-label={isOpen ? t`Close chat` : t`Open chat`}
      >
        <Icon name={isOpen ? "close" : "ai"} size="1.5rem" />
      </UnstyledButton>
    </div>
  );
};

METABOT_CHAT_SDK_EE_PLUGIN.FloatingActionButton =
  withPublicComponentWrapper(FloatingActionButtonInner, {
    supportsGuestEmbed: false,
  });

/**
 * CommandBar trigger — centered bottom bar that expands into a chat panel.
 */
const CommandBarInner = ({
  className,
  style,
  panelHeight = 400,
  width = 600,
  children,
}: MetabotCommandBarProps) => {
  const metabot = useMetabotAgent();
  const [isExpanded, setIsExpanded] = useState(false);

  const hasMessages =
    metabot.messages.length > 0 || metabot.errorMessages.length > 0;
  const showPanel = isExpanded || hasMessages || metabot.isDoingScience;

  return (
    <div className={cx(S.commandBarContainer, className)} style={{ ...style, width }}>
      {showPanel && (
        <div className={S.commandBarPanel} style={{ height: panelHeight }}>
          <Flex
            px="md"
            py="xs"
            align="center"
            justify="space-between"
            style={{ borderBottom: "1px solid var(--mb-color-border)", flexShrink: 0 }}
          >
            <Flex align="center" gap="xs">
              <Icon name="ai" c="brand" size="1rem" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--mb-color-text-primary)" }}>
                {t`Metabot`}
              </span>
            </Flex>
            <UnstyledButton
              onClick={() => setIsExpanded(false)}
              data-testid="metabot-command-bar-collapse"
              className={S.chatButton}
              aria-label={t`Collapse`}
            >
              <Icon name="chevrondown" c="text-secondary" size="1rem" />
            </UnstyledButton>
          </Flex>
          <MetabotChatInner
            height={`calc(${typeof panelHeight === "number" ? `${panelHeight}px` : panelHeight} - 40px)`}
            width="100%"
          >
            {children}
          </MetabotChatInner>
        </div>
      )}

      {!showPanel && (
        <div className={S.commandBarInput} style={{ width }}>
          <Flex
            gap="xs"
            px="md"
            py="sm"
            align="center"
            onClick={() => setIsExpanded(true)}
            style={{ cursor: "pointer" }}
            data-testid="metabot-command-bar"
          >
            <Icon name="ai" c="brand" size="1rem" />
            <span style={{ color: "var(--mb-color-text-light)" }}>
              {t`Ask AI a question...`}
            </span>
          </Flex>
        </div>
      )}
    </div>
  );
};

METABOT_CHAT_SDK_EE_PLUGIN.CommandBar = withPublicComponentWrapper(
  CommandBarInner,
  { supportsGuestEmbed: false },
);
