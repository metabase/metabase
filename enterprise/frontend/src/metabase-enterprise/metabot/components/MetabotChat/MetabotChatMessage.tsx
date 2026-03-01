import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  ActionIcon,
  Flex,
  type FlexProps,
  Icon,
  type IconName,
  Text,
  Tooltip,
} from "metabase/ui";
import { useSubmitMetabotFeedbackMutation } from "metabase-enterprise/api/metabot";
import type {
  MetabotAgentChatMessage,
  MetabotAgentTextChatMessage,
  MetabotChatMessage,
  MetabotErrorMessage,
  MetabotUserChatMessage,
} from "metabase-enterprise/metabot/state";
import type { MetabotFeedback } from "metabase-types/api";

import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";
import { AgentToolCallMessage } from "./MetabotAgentToolCallMessage";
import Styles from "./MetabotChat.module.css";
import { MetabotFeedbackModal } from "./MetabotFeedbackModal";

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
  onCopy: () => void;
}

export const UserMessage = ({
  message,
  className,
  hideActions,
  onCopy,
  ...props
}: UserMessageProps) => (
  <MessageContainer chatRole={message.role} {...props}>
    {message.type === "text" && (
      <AIMarkdown className={cx(Styles.message, Styles.messageUser)}>
        {message.message}
      </AIMarkdown>
    )}

    {message.type === "action" && (
      <Flex direction="column" gap="xs">
        <Flex align="center" gap="xs">
          <Text className={cx(Styles.message, Styles.messageUserAction)}>
            {message.userMessage}
          </Text>
        </Flex>
      </Flex>
    )}

    <Flex className={Styles.messageActions}>
      {!hideActions && (
        <ActionIcon
          h="sm"
          data-testid="metabot-chat-message-copy"
          onClick={onCopy}
        >
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      )}
    </Flex>
  </MessageContainer>
);

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
  message: MetabotAgentChatMessage;
  onRetry?: (messageId: string) => void;
  onCopy: (messageId: string) => void;
  showFeedbackButtons: boolean;
  setFeedbackMessage?: (data: { messageId: string; positive: boolean }) => void;
  submittedFeedback: "positive" | "negative" | undefined;
  onInternalLinkClick?: (link: string) => void;
}

export const AgentMessage = ({
  message,
  className,
  onCopy,
  onRetry,
  showFeedbackButtons,
  setFeedbackMessage,
  submittedFeedback,
  onInternalLinkClick,
  hideActions,
  ...props
}: AgentMessageProps) => {
  return (
    <MessageContainer chatRole={message.role} {...props}>
      {message.type === "text" && (
        <AIMarkdown
          className={Styles.message}
          onInternalLinkClick={onInternalLinkClick}
        >
          {message.message}
        </AIMarkdown>
      )}
      {message.type === "edit_suggestion" && (
        <AgentSuggestionMessage message={message} />
      )}
      {message.type === "todo_list" && (
        <AgentTodoListMessage todos={message.payload} />
      )}
      {message.type === "tool_call" && (
        <AgentToolCallMessage message={message} />
      )}
      <Flex className={Styles.messageActions}>
        {!hideActions && (
          <>
            <Tooltip label={t`Copy`}>
              <ActionIcon
                h="sm"
                data-testid="metabot-chat-message-copy"
                onClick={() => onCopy(message.id)}
              >
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Tooltip>
            {showFeedbackButtons && setFeedbackMessage && (
              <>
                <Tooltip label={t`Give positive feedback`}>
                  <FeedbackButton
                    data-testid="metabot-chat-message-thumbs-up"
                    icon="thumbs_up"
                    hasBeenClicked={submittedFeedback === "positive"}
                    disabled={!!submittedFeedback}
                    onClick={() =>
                      setFeedbackMessage({
                        messageId: message.id,
                        positive: true,
                      })
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
                      setFeedbackMessage({
                        messageId: message.id,
                        positive: false,
                      })
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
          </>
        )}
      </Flex>
    </MessageContainer>
  );
};

export const AgentErrorMessage = ({
  message,
  className,
  ...props
}: FlexProps & {
  message: MetabotErrorMessage;
}) => (
  <MessageContainer chatRole="agent" {...props}>
    {message.type === "alert" ? (
      <Flex gap="sm">
        <Icon name="warning" c="error" size="1rem" mt="2px" flex="0 0 auto" />
        <Text c="error" className={Styles.message}>
          {message.message}
        </Text>
      </Flex>
    ) : (
      <Text className={Styles.message}>{message.message}</Text>
    )}
  </MessageContainer>
);

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

export const Messages = ({
  messages,
  errorMessages,
  onRetryMessage,
  isDoingScience,
  showFeedbackButtons,
  onInternalLinkClick,
}: {
  messages: MetabotChatMessage[];
  errorMessages: MetabotErrorMessage[];
  onRetryMessage?: (messageId: string) => void;
  isDoingScience: boolean;
  showFeedbackButtons: boolean;
  onInternalLinkClick?: (navigateToPath: string) => void;
}) => {
  const clipboard = useClipboard();
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
    const { message_id, positive } = metabotFeedback.feedback;

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

  const onAgentMessageCopy = useCallback(
    (messageId: string) => {
      const allMessages = getFullAgentReply(messages, messageId);
      const textMessages = allMessages.filter(
        (msg): msg is MetabotAgentTextChatMessage =>
          msg.role === "agent" && msg.type === "text",
      );
      clipboard.copy(textMessages.map((msg) => msg.message).join("\n\n"));
    },
    [messages, clipboard],
  );

  const setFeedbackModal = useCallback(
    (data: { messageId: string; positive: boolean } | undefined) => {
      if (!showFeedbackButtons) {
        return;
      }

      setFeedbackState((prev) => ({ ...prev, modal: data }));
    },
    [showFeedbackButtons],
  );

  return (
    <>
      {messages.map((message, index) =>
        message.role === "agent" ? (
          <AgentMessage
            key={"msg-" + message.id}
            data-testid="metabot-chat-message"
            message={message}
            onRetry={onRetryMessage}
            onCopy={onAgentMessageCopy}
            showFeedbackButtons={showFeedbackButtons}
            setFeedbackMessage={setFeedbackModal}
            submittedFeedback={feedbackState.submitted[message.id]}
            hideActions={
              isDoingScience || messages[index + 1]?.role === "agent"
            }
            onInternalLinkClick={onInternalLinkClick}
          />
        ) : (
          <UserMessage
            key={"msg-" + message.id}
            data-testid="metabot-chat-message"
            message={message}
            hideActions={isDoingScience && messages.length === index + 1}
            onCopy={() => {
              const copyText =
                message.type === "action"
                  ? `${message.userMessage}: ${message.message}`
                  : message.message;
              clipboard.copy(copyText);
            }}
          />
        ),
      )}

      {errorMessages.map((message, index) => (
        <AgentErrorMessage
          key={"err-" + index}
          data-testid="metabot-chat-message"
          message={message}
        />
      ))}

      {feedbackState.modal && (
        <MetabotFeedbackModal
          {...feedbackState.modal}
          onClose={() => setFeedbackModal(undefined)}
          onSubmit={submitFeedback}
        />
      )}
    </>
  );
};
