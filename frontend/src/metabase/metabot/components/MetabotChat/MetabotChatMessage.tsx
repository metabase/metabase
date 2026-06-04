import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useSubmitMetabotFeedbackMutation } from "metabase/api/metabot";
import { useToast } from "metabase/common/hooks";
import { MetabotManagedProviderLimitActions } from "metabase/metabot/components/MetabotManagedProviderLimit";
import { useMetabotName } from "metabase/metabot/hooks";
import type {
  MetabotAgentChatMessage,
  MetabotAgentDataPartMessage,
  MetabotAgentId,
  MetabotAgentTextChatMessage,
  MetabotAgentTurnError,
  MetabotAgentTurnErroredMessage,
  MetabotChatMessage,
  MetabotDataPart,
  MetabotUserChatMessage,
} from "metabase/metabot/state";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Flex,
  type FlexProps,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName, MetabotFeedback } from "metabase-types/api";

import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import { AgentDataPartMessage } from "./MetabotAgentDataPartMessage";
import { AgentDocumentMessage } from "./MetabotAgentDocumentMessage";
import { AgentToolCallMessage } from "./MetabotAgentToolCallMessage";
import Styles from "./MetabotChat.module.css";
import { MetabotRevealBlock } from "./MetabotDotField/MetabotRevealBlock";
import type { RevealContentKind } from "./MetabotDotField/reveal-timeline";
import { MetabotFeedbackModal } from "./MetabotFeedbackModal";
import type {
  DataPointMentionTarget,
  DataSelection,
} from "./data-point-mentions";

const isUserVisibleDataPart = (part: MetabotDataPart): boolean =>
  match(part)
    .with({ type: "todo_list" }, () => true)
    .with({ type: "transform_suggestion" }, () => true)
    .with({ type: "code_edit" }, () => true)
    .with({ type: "adhoc_viz" }, () => true)
    .with({ type: "static_viz" }, () => false)
    .with({ type: "automagic_dashboard" }, () => true)
    .exhaustive();

const isUserVisibleDataPartMessage = (
  message: MetabotAgentDataPartMessage,
): boolean =>
  match(message)
    .with({ part: { type: "code_edit" } }, ({ metadata }) => {
      return metadata?.codeEditBuffer?.source.database_id != null;
    })
    .otherwise(({ part }) => isUserVisibleDataPart(part));

const isUserVisibleMessage = (message: MetabotChatMessage): boolean =>
  match(message)
    .with({ type: "text" }, () => true)
    .with({ type: "data_part" }, (message) =>
      isUserVisibleDataPartMessage(message),
    )
    .with({ type: "tool_call" }, () => false)
    .with({ type: "turn_aborted" }, () => true)
    .with({ type: "turn_errored" }, () => true)
    .with({ type: "document" }, () => true)
    .exhaustive();

interface BaseMessageProps extends Omit<FlexProps, "onCopy"> {
  message: MetabotChatMessage;
  hideActions: boolean;
}

export const MessageContainer = ({
  chatRole,
  className,
  ...props
}: FlexProps & {
  chatRole: MetabotChatMessage["role"];
}) => (
  <Flex
    className={cx(
      Styles.messageContainer,
      chatRole === "user"
        ? Styles.messageContainerUser
        : Styles.messageContainerAgent,
      className,
    )}
    data-message-role={chatRole}
    direction="column"
    {...props}
  />
);

interface UserMessageProps extends Omit<BaseMessageProps, "message"> {
  message: MetabotUserChatMessage;
}

export const UserMessage = ({
  message,
  className,
  hideActions,
  ...props
}: UserMessageProps) => {
  const clipboard = useClipboard({ timeout: 2000 });

  return (
    <MessageContainer chatRole={message.role} {...props}>
      {message.type === "text" && (
        <AIMarkdown
          className={cx(Styles.message, Styles.messageUser)}
          singleNewlinesAreParagraphs
        >
          {message.message}
        </AIMarkdown>
      )}

      <Flex className={Styles.messageActions}>
        {!hideActions && (
          <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy`}>
            <ActionIcon
              h="sm"
              data-testid="metabot-chat-message-copy"
              onClick={() => clipboard.copy(message.message)}
            >
              <Icon name="copy" size="1rem" />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>
    </MessageContainer>
  );
};

interface FeedbackButtonProps {
  disabled: boolean;
  icon: IconName;
  onClick: () => void;
  hasBeenClicked: boolean;
}

const FeedbackButton = forwardRef<HTMLButtonElement, FeedbackButtonProps>(
  function FeedbackButton(
    { disabled, icon, onClick, hasBeenClicked, ...props },
    ref,
  ) {
    return (
      <ActionIcon
        onClick={onClick}
        disabled={disabled}
        h="sm"
        {...props}
        ref={ref}
      >
        <Icon
          name={icon}
          size="1rem"
          c={hasBeenClicked ? "brand" : "currentColor"}
        />
      </ActionIcon>
    );
  },
);

interface AgentMessageProps extends Omit<BaseMessageProps, "message"> {
  agentId: MetabotAgentId;
  message: MetabotAgentChatMessage;
  debug: boolean;
  readonly: boolean;
  onRetry?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  getCopyText: () => string;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  dataSelections?: Record<string, DataSelection | undefined>;
  setFeedbackMessage?: (data: { messageId: string; positive: boolean }) => void;
  submittedFeedback: "positive" | "negative" | undefined;
  onInternalLinkClick?: (link: string) => void;
  /** Animate newly-streamed markdown text word-by-word. */
  animate?: boolean;
  /** When true, this block plays the "reserve then reveal" dot-field intro. */
  revealAnimate?: boolean;
}

// Text and adhoc-viz charts get the reserve-then-reveal treatment; charts use
// the slightly longer timeline (they get a draw beat). Other block types render
// without it.
const getRevealKind = (
  message: MetabotAgentChatMessage,
): RevealContentKind | null =>
  match(message)
    .with({ type: "text" }, () => "text" as const)
    .with(
      { type: "data_part", part: { type: "adhoc_viz" } },
      () => "chart" as const,
    )
    .otherwise(() => null);

export const AgentMessage = ({
  agentId,
  message,
  className,
  debug,
  readonly,
  getCopyText,
  dataPointTargets,
  dataSelections,
  onRetry,
  onFork,
  setFeedbackMessage,
  submittedFeedback,
  onInternalLinkClick,
  hideActions,
  animate,
  revealAnimate,
  ...props
}: AgentMessageProps) => {
  const messageId = "externalId" in message ? (message.externalId ?? "") : "";
  const canGiveFeedback = !!(setFeedbackMessage && messageId);
  const clipboard = useClipboard({ timeout: 2000 });

  const revealKind = getRevealKind(message);
  const content = match(message)
    .with({ type: "text" }, (m) => (
      <AIMarkdown
        className={Styles.message}
        onInternalLinkClick={onInternalLinkClick}
        dataPointTargets={dataPointTargets}
        dataSelections={dataSelections}
        animate={animate}
      >
        {m.message}
      </AIMarkdown>
    ))
    .with({ type: "data_part" }, (m) => (
      <AgentDataPartMessage
        agentId={agentId}
        message={m}
        debug={debug}
        readonly={readonly}
        dataPointTargets={dataPointTargets}
      />
    ))
    .with({ type: "tool_call" }, (m) => <AgentToolCallMessage message={m} />)
    .with({ type: "turn_aborted" }, (m) => (
      <AbortedTurnAlert messageId={m.id} debug={debug} onRetry={onRetry} />
    ))
    .with({ type: "turn_errored" }, (m) => (
      <AgentErroredTurnAlert message={m} debug={debug} />
    ))
    .with({ type: "document" }, (m) => (
      <AgentDocumentMessage documentId={m.documentId} agentId={agentId} />
    ))
    .exhaustive();

  return (
    <MessageContainer chatRole={message.role} {...props}>
      {revealAnimate && revealKind ? (
        <MetabotRevealBlock kind={revealKind} animate>
          {content}
        </MetabotRevealBlock>
      ) : (
        content
      )}
      {!hideActions && (
        <Flex className={Styles.messageActions}>
          <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy`}>
            <ActionIcon
              h="sm"
              data-testid="metabot-chat-message-copy"
              onClick={() => clipboard.copy(getCopyText())}
            >
              <Icon name="copy" size="1rem" />
            </ActionIcon>
          </Tooltip>
          {canGiveFeedback && (
            <>
              <Tooltip label={t`Give positive feedback`}>
                <FeedbackButton
                  data-testid="metabot-chat-message-thumbs-up"
                  icon="thumbs_up"
                  hasBeenClicked={submittedFeedback === "positive"}
                  disabled={!!submittedFeedback}
                  onClick={() =>
                    setFeedbackMessage({ messageId, positive: true })
                  }
                />
              </Tooltip>
              <Tooltip label={t`Give negative feedback`}>
                <FeedbackButton
                  data-testid="metabot-chat-message-thumbs-down"
                  icon="thumbs_down"
                  hasBeenClicked={submittedFeedback === "negative"}
                  disabled={!!submittedFeedback}
                  onClick={() =>
                    setFeedbackMessage({ messageId, positive: false })
                  }
                />
              </Tooltip>
            </>
          )}
          {onRetry && (
            <Tooltip label={t`Retry`}>
              <ActionIcon
                onClick={() => onRetry(message.id)}
                h="sm"
                data-testid="metabot-chat-message-retry"
              >
                <Icon name="revert" size="1rem" />
              </ActionIcon>
            </Tooltip>
          )}
          {onFork && (
            <Tooltip label={t`Fork chat`}>
              <ActionIcon
                onClick={() => onFork(message.id)}
                h="sm"
                data-testid="metabot-chat-message-fork"
              >
                <Icon name="git_branch" size="1rem" />
              </ActionIcon>
            </Tooltip>
          )}
        </Flex>
      )}
    </MessageContainer>
  );
};

const AgentTurnAlert = ({
  variant,
  message,
  cta,
  footer,
  debugDetails,
}: {
  variant: "error" | "info";
  message: string;
  cta?: ReactNode;
  footer?: ReactNode;
  debugDetails?: MetabotAgentTurnError;
}) => (
  <Flex
    direction="column"
    gap="xs"
    p="sm"
    bd="1px solid var(--mb-color-border)"
    bdrs="sm"
    data-testid="metabot-chat-message-turn-alert"
    bg="background-primary"
  >
    <Flex align="center" gap="sm">
      <Icon
        name={variant === "error" ? "warning" : "info"}
        c={variant === "error" ? "error" : "text-secondary"}
        size="1rem"
        flex="0 0 auto"
      />
      <Text c="text-secondary" size="sm" flex="1">
        {message}
      </Text>
      {cta}
    </Flex>
    {debugDetails && (
      <Card
        bdrs="xs"
        ml="lg"
        p="sm"
        withBorder
        shadow="none"
        c="text-secondary"
        fz="xs"
        ff="monospace"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        data-testid="metabot-chat-message-turn-alert-debug"
      >
        {JSON.stringify(debugDetails, null, 2)}
      </Card>
    )}
    {footer && <Box ml="lg">{footer}</Box>}
  </Flex>
);

const AgentErroredTurnAlert = ({
  message,
  debug,
}: {
  message: MetabotAgentTurnErroredMessage;
  debug: boolean;
}) => (
  <AgentTurnAlert
    variant="error"
    message={message.display?.message ?? t`Something went wrong`}
    footer={
      message.error.type === "metabase_ai_managed_locked" && (
        <MetabotManagedProviderLimitActions inline />
      )
    }
    debugDetails={debug ? message.error : undefined}
  />
);

const AbortedTurnAlert = ({
  messageId,
  debug,
  onRetry,
}: {
  messageId: string;
  debug: boolean;
  onRetry?: (messageId: string) => void;
}) => {
  const metabotName = useMetabotName();
  return (
    <AgentTurnAlert
      variant="info"
      message={t`Response from ${metabotName} was interrupted`}
      cta={
        !debug && onRetry ? (
          <Button
            variant="default"
            size="compact-xs"
            fz="xs"
            onClick={() => onRetry(messageId)}
            data-testid="metabot-chat-message-retry"
          >
            {t`Retry`}
          </Button>
        ) : null
      }
    />
  );
};

export const getFullAgentReply = (
  messages: MetabotChatMessage[],
  messageId: string,
) => {
  const messageIndex = messages.findLastIndex((m) => m.id === messageId);
  const message = messages[messageIndex];
  if (!message) {
    return [];
  }

  if (message.role === "user") {
    console.warn("getFullAgentReply requires a user message id");
    return [];
  }

  const firstMessageIndex =
    (messages.slice(0, messageIndex).findLastIndex((m) => m.role === "user") ??
      0) + 1;
  const lastMessageIndex =
    messageIndex +
    Math.max(
      messages.slice(messageIndex).findIndex((m) => m.role === "user"),
      0,
    );

  return messages.slice(firstMessageIndex, lastMessageIndex + 1);
};

export const Messages = memo(function Messages({
  agentId,
  messages,
  onRetryMessage,
  onForkMessage,
  isDoingScience,
  debug,
  readonly = false,
  onInternalLinkClick,
  dataPointTargets,
  dataSelections,
}: {
  agentId: MetabotAgentId;
  messages: MetabotChatMessage[];
  onRetryMessage?: (messageId: string) => void;
  onForkMessage?: (messageId: string) => void;
  isDoingScience: boolean;
  debug: boolean;
  readonly?: boolean;
  onInternalLinkClick?: (link: string) => void;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  dataSelections?: Record<string, DataSelection | undefined>;
}) {
  const visibleMessages = useMemo(
    () => (debug ? messages : messages.filter(isUserVisibleMessage)),
    [debug, messages],
  );
  const [sendToast] = useToast();

  const [feedbackState, setFeedbackState] = useState<{
    submitted: Record<string, "positive" | "negative" | undefined>;
    modal: { messageId: string; positive: boolean } | undefined;
  }>({
    submitted: {},
    modal: undefined,
  });

  const [submitMetabotFeedback] = useSubmitMetabotFeedbackMutation();

  const submitFeedback = async (metabotFeedback: MetabotFeedback) => {
    const { message_id, positive } = metabotFeedback;

    try {
      await submitMetabotFeedback(metabotFeedback).unwrap();
      sendToast({ icon: "check", message: t`Feedback submitted` });

      setFeedbackState((prevState) => ({
        submitted: {
          ...prevState.submitted,
          [message_id]: positive ? "positive" : "negative",
        },
        modal: undefined,
      }));
    } catch (error) {
      sendToast({ icon: "warning", message: t`Failed to submit feedback` });
    }
  };

  // Remember which messages first appeared mid-turn so only freshly streamed
  // blocks play the reserve-then-reveal intro; historical/persisted messages
  // (first seen when not generating) render instantly. The decision is latched
  // per id, so streaming re-renders don't restart or cancel the reveal.
  const revealStateRef = useRef<Map<string, boolean>>(new Map());
  const shouldRevealMessage = (id: string) => {
    const seen = revealStateRef.current;
    if (!seen.has(id)) {
      seen.set(id, isDoingScience);
    }
    return seen.get(id) ?? false;
  };

  const getAgentReplyCopyText = useCallback(
    (messageId: string) => {
      const allMessages = getFullAgentReply(messages, messageId);
      const textMessages = allMessages.filter(
        (msg): msg is MetabotAgentTextChatMessage =>
          msg.role === "agent" && msg.type === "text",
      );
      return textMessages.map((msg) => msg.message).join("\n\n");
    },
    [messages],
  );

  return (
    <>
      {visibleMessages.map((message, index) => {
        const next = visibleMessages[index + 1];
        return message.role === "agent" ? (
          <AgentMessage
            key={"msg-" + message.id}
            data-testid="metabot-chat-message"
            agentId={agentId}
            message={message}
            debug={debug}
            readonly={readonly}
            onRetry={onRetryMessage}
            onFork={onForkMessage}
            getCopyText={() => getAgentReplyCopyText(message.id)}
            dataPointTargets={dataPointTargets}
            dataSelections={dataSelections}
            setFeedbackMessage={(data) =>
              setFeedbackState((prev) => ({ ...prev, modal: data }))
            }
            submittedFeedback={
              "externalId" in message && message.externalId
                ? feedbackState.submitted[message.externalId]
                : undefined
            }
            hideActions={next?.role === "agent" || (isDoingScience && !next)}
            onInternalLinkClick={onInternalLinkClick}
            animate={isDoingScience && !next && message.type === "text"}
            revealAnimate={shouldRevealMessage(message.id)}
          />
        ) : (
          <UserMessage
            key={"msg-" + message.id}
            data-testid="metabot-chat-message"
            message={message}
            hideActions={isDoingScience && visibleMessages.length === index + 1}
          />
        );
      })}

      {feedbackState.modal && (
        <MetabotFeedbackModal
          {...feedbackState.modal}
          onClose={() =>
            setFeedbackState((prev) => ({ ...prev, modal: undefined }))
          }
          onSubmit={submitFeedback}
        />
      )}
    </>
  );
});
