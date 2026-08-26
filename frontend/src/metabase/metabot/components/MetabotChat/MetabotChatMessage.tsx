import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { Fragment, forwardRef, useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { MetabotManagedProviderLimitActions } from "metabase/metabot/components/MetabotManagedProviderLimit";
import {
  type MetabotAgentDataPartMessage,
  type MetabotAgentId,
  type MetabotAgentTurnDisplayError,
  type MetabotAgentTurnError,
  type MetabotDataPart,
  type MetabotDebugToolCallMessage,
  type MetabotIncompleteFinishReason,
  type MetabotMessage,
  type MetabotMessagePart,
  type MetabotMessageStatus,
  forkConversation,
  isChainOfThoughtMessage,
} from "metabase/metabot/state";
import { useDispatch } from "metabase/redux";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Flex,
  type FlexProps,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName, MetabotFeedback } from "metabase-types/api";

import { useSubmitMetabotFeedbackMutation } from "../../api";
import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import { AgentDataPart } from "./MetabotAgentDataPart";
import { AgentToolCallPart } from "./MetabotAgentToolCallPart";
import { MetabotChainOfThought } from "./MetabotChainOfThought";
import Styles from "./MetabotChat.module.css";
import { MetabotFeedbackModal } from "./MetabotFeedbackModal";

const isUserVisibleDataPart = (part: MetabotDataPart): boolean =>
  match(part)
    .with({ type: "data-todo_list" }, () => true)
    .with({ type: "data-transform_suggestion" }, () => true)
    .with({ type: "data-navigate_to" }, () => true)
    .with({ type: "data-code_edit" }, () => true)
    .with({ type: "data-generated_entity" }, () => true)
    .with({ type: "data-entity_saved" }, () => true)
    .with({ type: "data-adhoc_viz" }, () => false)
    .with({ type: "data-static_viz" }, () => false)
    .exhaustive();

const isUserVisibleAgentDataPart = (
  part: MetabotAgentDataPartMessage,
): boolean =>
  match(part)
    .with({ part: { type: "data-code_edit" } }, ({ metadata }) => {
      return metadata?.codeEditBuffer?.source.database_id != null;
    })
    .otherwise(({ part }) => isUserVisibleDataPart(part));

const isUserVisiblePart = (part: MetabotMessagePart): boolean =>
  match(part)
    .with({ type: "text" }, () => true)
    .with({ type: "data_part" }, (part) => isUserVisibleAgentDataPart(part))
    .with({ type: "tool_call" }, () => false)
    .with({ type: "chain_of_thought" }, () => true)
    .exhaustive();

const isConversationContent = (part: MetabotMessagePart) =>
  !isChainOfThoughtMessage(part) && part.type !== "tool_call";

const useMessageText = (message: MetabotMessage) =>
  useMemo(
    () =>
      message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.message)
        .join("\n\n"),
    [message.parts],
  );

export const PartContainer = ({
  chatRole,
  className,
  ...props
}: FlexProps & {
  chatRole: MetabotMessage["role"];
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

const CopyAction = ({ text }: { text: string }) => {
  const clipboard = useClipboard({ timeout: 2000 });

  if (!text) {
    return null;
  }

  return (
    <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy`}>
      <ActionIcon
        h="sm"
        data-testid="metabot-chat-message-copy"
        onClick={() => clipboard.copy(text)}
      >
        <Icon name="copy" size="1rem" />
      </ActionIcon>
    </Tooltip>
  );
};

interface UserMessageProps extends Omit<FlexProps, "onCopy"> {
  message: MetabotMessage;
  hideActions: boolean;
  extraActions?: ReactNode;
}

export const UserMessage = ({
  message,
  className,
  hideActions,
  extraActions,
  ...props
}: UserMessageProps) => {
  const text = useMessageText(message);

  return (
    <PartContainer
      chatRole="user"
      data-testid="metabot-chat-message"
      {...props}
    >
      {text && (
        <AIMarkdown
          className={cx(Styles.message, Styles.messageUser)}
          singleNewlinesAreParagraphs
        >
          {text}
        </AIMarkdown>
      )}

      <Flex className={Styles.messageActions}>
        {!hideActions && <CopyAction text={text} />}
        {extraActions}
      </Flex>
    </PartContainer>
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
          c={hasBeenClicked ? "core-brand" : "currentColor"}
        />
      </ActionIcon>
    );
  },
);

type AgentPartProps = {
  part: MetabotMessagePart;
  externalId?: string;
  debug: boolean;
  readonly: boolean;
  conversationId: string;
  isStreaming: boolean;
  supportsReasoning: boolean;
  onInternalLinkClick?: (link: string) => void;
  onToolCallSelect?: (part: MetabotDebugToolCallMessage) => void;
};

const AgentPart = ({
  part,
  externalId,
  debug,
  readonly,
  conversationId,
  isStreaming,
  supportsReasoning,
  onInternalLinkClick,
  onToolCallSelect,
}: AgentPartProps) =>
  match(part)
    .with({ type: "text" }, (p) => (
      <AIMarkdown
        className={Styles.message}
        onInternalLinkClick={onInternalLinkClick}
        isStreaming={isStreaming}
      >
        {p.message}
      </AIMarkdown>
    ))
    .with({ type: "data_part" }, (p) => (
      <AgentDataPart
        dataPart={p}
        externalId={externalId}
        debug={debug}
        readonly={readonly}
        conversationId={conversationId}
      />
    ))
    .with({ type: "tool_call" }, (p) => (
      <AgentToolCallPart part={p} onSelect={onToolCallSelect} />
    ))
    .with({ type: "chain_of_thought" }, (p) => (
      <MetabotChainOfThought part={p} supportsReasoning={supportsReasoning} />
    ))
    .exhaustive();

interface AgentMessageProps extends Omit<FlexProps, "onCopy"> {
  message: MetabotMessage;
  debug: boolean;
  readonly: boolean;
  conversationId: string;
  onRetry?: () => void;
  onContinue?: (resumePrompt: string) => void;
  onRefreshConversation?: () => void;
  setFeedbackMessage?: (data: { messageId: string; positive: boolean }) => void;
  submittedFeedback: "positive" | "negative" | undefined;
  onInternalLinkClick?: (link: string) => void;
  hideActions?: boolean;
  extraActions?: ReactNode;
  isStreaming?: boolean;
  supportsReasoning?: boolean;
  onFork?: (messageId: string) => void;
  isForking?: boolean;
  onToolCallSelect?: (part: MetabotDebugToolCallMessage) => void;
}

type MessageActionsProps = {
  message: MetabotMessage;
  canGiveFeedback: boolean;
  canFork: boolean;
  isForking?: boolean;
  submittedFeedback: "positive" | "negative" | undefined;
  setFeedbackMessage?: (data: { messageId: string; positive: boolean }) => void;
  onRetry?: () => void;
  onFork?: (messageId: string) => void;
  extraActions?: ReactNode;
};

const MessageActions = ({
  message,
  canGiveFeedback,
  canFork,
  isForking,
  submittedFeedback,
  setFeedbackMessage,
  onRetry,
  onFork,
  extraActions,
}: MessageActionsProps) => {
  const messageId = message.externalId ?? "";
  const text = useMessageText(message);

  return (
    <Flex className={Styles.messageActions} align="center">
      <CopyAction text={text} />
      {canGiveFeedback && setFeedbackMessage && (
        <>
          <Tooltip label={t`Give positive feedback`}>
            <FeedbackButton
              data-testid="metabot-chat-message-thumbs-up"
              icon="thumbs_up"
              hasBeenClicked={submittedFeedback === "positive"}
              disabled={!!submittedFeedback}
              onClick={() => setFeedbackMessage({ messageId, positive: true })}
            />
          </Tooltip>
          <Tooltip label={t`Give negative feedback`}>
            <FeedbackButton
              data-testid="metabot-chat-message-thumbs-down"
              icon="thumbs_down"
              hasBeenClicked={submittedFeedback === "negative"}
              disabled={!!submittedFeedback}
              onClick={() => setFeedbackMessage({ messageId, positive: false })}
            />
          </Tooltip>
        </>
      )}
      {onRetry && (
        <Tooltip label={t`Retry`}>
          <ActionIcon
            onClick={onRetry}
            h="sm"
            data-testid="metabot-chat-message-retry"
          >
            <Icon name="revert" size="1rem" />
          </ActionIcon>
        </Tooltip>
      )}
      {extraActions}
      {canFork && onFork && (
        <Tooltip label={t`Fork conversation`}>
          <ActionIcon
            h="sm"
            data-testid="metabot-chat-message-fork"
            loading={isForking}
            disabled={isForking}
            onClick={() => onFork(messageId)}
          >
            <Icon name="git_branch" size="1rem" />
          </ActionIcon>
        </Tooltip>
      )}
    </Flex>
  );
};

export const AgentMessage = ({
  message,
  debug,
  readonly,
  conversationId,
  onRetry,
  onContinue,
  onRefreshConversation,
  setFeedbackMessage,
  submittedFeedback,
  onInternalLinkClick,
  hideActions = false,
  extraActions,
  isStreaming = false,
  supportsReasoning = true,
  onFork,
  isForking,
  onToolCallSelect,
  ...props
}: AgentMessageProps) => {
  const messageId = message.externalId ?? "";
  const isFailed =
    message.status.type === "errored" || message.status.type === "aborted";
  const canActOnMessage = !readonly && !!messageId;

  const visibleParts = debug
    ? message.parts
    : message.parts.filter(isUserVisiblePart);
  // the action bar belongs on the reply's final rendered content, and only once
  // the reply has stopped growing
  const actionsIndex =
    isStreaming || hideActions
      ? -1
      : visibleParts.findLastIndex(isConversationContent);

  const actions = (
    <MessageActions
      message={message}
      canGiveFeedback={canActOnMessage && !!setFeedbackMessage}
      canFork={canActOnMessage && !isFailed}
      isForking={isForking}
      submittedFeedback={submittedFeedback}
      setFeedbackMessage={setFeedbackMessage}
      onRetry={onRetry}
      onFork={onFork}
      extraActions={extraActions}
    />
  );

  const status = (
    <MessageStatus
      status={message.status}
      debug={debug}
      onRetry={onRetry}
      onContinue={onContinue}
      onRefreshConversation={onRefreshConversation}
    />
  );
  const needsStatusRow =
    message.status.type !== "done" &&
    message.status.type !== "streaming" &&
    !(message.status.type === "in_progress" && visibleParts.length > 0);
  const showActionsInStatusRow =
    needsStatusRow && !isStreaming && !hideActions && actionsIndex === -1;

  return (
    <>
      {visibleParts.map((part, index) => (
        <PartContainer
          key={part.id}
          chatRole="agent"
          data-testid="metabot-chat-message"
          {...props}
        >
          <AgentPart
            part={part}
            externalId={message.externalId}
            debug={debug}
            readonly={readonly}
            conversationId={conversationId}
            isStreaming={isStreaming && index === visibleParts.length - 1}
            supportsReasoning={supportsReasoning}
            onInternalLinkClick={onInternalLinkClick}
            onToolCallSelect={onToolCallSelect}
          />
          {index === actionsIndex && actions}
        </PartContainer>
      ))}
      {needsStatusRow && (
        <PartContainer chatRole="agent" data-testid="metabot-chat-message">
          {status}
          {showActionsInStatusRow && actions}
        </PartContainer>
      )}
    </>
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
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="sm"
    data-testid="metabot-chat-message-turn-alert"
    bg="background_page-primary"
  >
    <Flex align="center" gap="sm">
      <Icon
        name={variant === "error" ? "warning" : "info"}
        c={variant === "error" ? "feedback-negative" : "text-secondary"}
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
  error,
  display,
  debug,
  onRefreshConversation,
}: {
  error: MetabotAgentTurnError;
  display?: MetabotAgentTurnDisplayError;
  debug: boolean;
  onRefreshConversation?: () => void;
}) => {
  const isOutOfSync = error.type === "conversation_out_of_sync";

  return (
    <AgentTurnAlert
      variant="error"
      message={display?.message ?? t`Something went wrong`}
      cta={
        isOutOfSync && onRefreshConversation ? (
          <Button
            variant="default"
            size="compact-xs"
            fz="xs"
            onClick={onRefreshConversation}
            data-testid="metabot-chat-message-refresh"
          >
            {t`Refresh`}
          </Button>
        ) : undefined
      }
      footer={
        error.type === "metabase_ai_managed_locked" && (
          <MetabotManagedProviderLimitActions inline />
        )
      }
      debugDetails={debug ? error : undefined}
    />
  );
};

const MessageStatus = ({
  status,
  debug,
  onRetry,
  onContinue,
  onRefreshConversation,
}: {
  status: MetabotMessageStatus;
  debug: boolean;
  onRetry?: () => void;
  onContinue?: (resumePrompt: string) => void;
  onRefreshConversation?: () => void;
}) =>
  match(status)
    .with({ type: "done" }, () => null)
    .with({ type: "streaming" }, () => null)
    .with({ type: "errored" }, (o) => (
      <AgentErroredTurnAlert
        error={o.error}
        display={o.display}
        debug={debug}
        onRefreshConversation={onRefreshConversation}
      />
    ))
    .with({ type: "aborted" }, () => (
      <AbortedTurnAlert debug={debug} onRetry={onRetry} />
    ))
    .with({ type: "incomplete" }, (o) => (
      <IncompleteTurnAlert
        finishReason={o.finishReason}
        contextWindowFull={o.contextWindowFull}
        onContinue={onContinue}
      />
    ))
    .with({ type: "in_progress" }, () => (
      <Loader
        type="dots"
        size="lg"
        color="core-brand"
        data-testid="metabot-response-loader"
      />
    ))
    .exhaustive();

const AbortedTurnAlert = ({
  debug,
  onRetry,
}: {
  debug: boolean;
  onRetry?: () => void;
}) => {
  const metabotName = useSetting("metabot-name");
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
            onClick={onRetry}
            data-testid="metabot-chat-message-retry"
          >
            {t`Retry`}
          </Button>
        ) : null
      }
    />
  );
};

const getIncompleteTurnConfig = (
  finishReason: MetabotIncompleteFinishReason,
  metabotName: string,
): { message: string; resumePrompt?: string } =>
  match(finishReason)
    .with("length", () => ({
      message: t`Response from ${metabotName} was cut off because it hit the maximum length`,
      resumePrompt: t`Your last response was cut off. Pick up exactly where you left off. Don't repeat anything you already wrote.`,
    }))
    .with("content-filter", () => ({
      message: t`Response from ${metabotName} was stopped by a content filter. Try rephrasing your question.`,
    }))
    .with("tool-calls", () => ({
      message: t`${metabotName} paused after reaching its step limit for this response`,
      resumePrompt: t`Continue working on my last request.`,
    }))
    .with("other", () => ({
      message: t`Response from ${metabotName} stopped before it finished`,
    }))
    .exhaustive();

const IncompleteTurnAlert = ({
  finishReason,
  contextWindowFull,
  onContinue,
}: {
  finishReason: MetabotIncompleteFinishReason;
  contextWindowFull?: boolean;
  onContinue?: (resumePrompt: string) => void;
}) => {
  const metabotName = useSetting("metabot-name");
  // "length" is overloaded, occurs when context window has been met (unrecoverable)
  // or when the max_tokens has been met (recoverable)
  const { message, resumePrompt } =
    finishReason === "length" && contextWindowFull
      ? {
          message: t`This conversation has reached its maximum length and can't continue. Please start a new chat.`,
          resumePrompt: undefined,
        }
      : getIncompleteTurnConfig(finishReason, metabotName);
  return (
    <AgentTurnAlert
      variant="info"
      message={message}
      cta={
        resumePrompt && onContinue ? (
          <Button
            variant="default"
            size="compact-xs"
            fz="xs"
            onClick={() => onContinue(resumePrompt)}
            data-testid="metabot-chat-message-continue"
          >
            {t`Continue`}
          </Button>
        ) : null
      }
    />
  );
};

export const Messages = ({
  messages,
  onRetryMessage,
  onContinueMessage,
  onRefreshConversation,
  isDoingScience,
  supportsReasoning = true,
  debug,
  readonly = false,
  agentId,
  conversationId,
  onInternalLinkClick,
  getExtraActions,
  renderAfterMessage,
  onToolCallSelect,
}: {
  messages: MetabotMessage[];
  onRetryMessage?: (messageId: string) => void;
  onContinueMessage?: (resumePrompt: string) => void;
  onRefreshConversation?: () => void;
  isDoingScience: boolean;
  supportsReasoning?: boolean;
  debug: boolean;
  readonly?: boolean;
  agentId?: MetabotAgentId;
  conversationId: string;
  onInternalLinkClick?: (navigateToPath: string) => void;
  getExtraActions?: (messageId: string) => ReactNode;
  renderAfterMessage?: (message: MetabotMessage) => ReactNode;
  onToolCallSelect?: (message: MetabotDebugToolCallMessage) => void;
}) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);

  const handleFork = useCallback(
    async (messageId: string) => {
      if (!agentId || isDoingScience) {
        return;
      }
      setForkingMessageId(messageId);
      try {
        await dispatch(
          forkConversation({ agentId, conversationId, messageId }),
        ).unwrap();
        sendToast({ icon: "check", message: t`Conversation forked` });
      } catch {
        sendToast({ icon: "warning", message: t`Failed to fork conversation` });
      } finally {
        setForkingMessageId(null);
      }
    },
    [dispatch, agentId, conversationId, sendToast, isDoingScience],
  );

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

  return (
    <>
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const externalId = message.externalId ?? "";

        return (
          <Fragment key={message.id}>
            {message.role === "agent" ? (
              <AgentMessage
                message={message}
                debug={debug}
                readonly={readonly}
                conversationId={conversationId}
                isStreaming={isDoingScience && isLastMessage}
                onRetry={
                  isLastMessage && onRetryMessage
                    ? () => onRetryMessage(message.id)
                    : undefined
                }
                onContinue={isLastMessage ? onContinueMessage : undefined}
                onRefreshConversation={onRefreshConversation}
                setFeedbackMessage={(data) =>
                  setFeedbackState((prev) => ({ ...prev, modal: data }))
                }
                submittedFeedback={
                  externalId ? feedbackState.submitted[externalId] : undefined
                }
                extraActions={getExtraActions?.(message.id)}
                onFork={
                  agentId && !readonly && !isDoingScience
                    ? handleFork
                    : undefined
                }
                isForking={!!externalId && forkingMessageId === externalId}
                onInternalLinkClick={onInternalLinkClick}
                supportsReasoning={supportsReasoning}
                onToolCallSelect={onToolCallSelect}
              />
            ) : (
              <UserMessage
                message={message}
                hideActions={isDoingScience && isLastMessage}
                extraActions={getExtraActions?.(message.id)}
              />
            )}
            {renderAfterMessage?.(message)}
          </Fragment>
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
};
