import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  ActionIcon,
  Flex,
  type FlexProps,
  Icon,
  type IconName,
  Text,
} from "metabase/ui";
import { useSubmitMetabotFeedbackMutation } from "metabase-enterprise/api/metabot";
import type {
  MetabotChatMessage,
  MetabotErrorMessage,
} from "metabase-enterprise/metabot/state";
import type { MetabotFeedback } from "metabase-types/api";

import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

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

interface UserMessageProps extends BaseMessageProps {
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
    <Text
      className={cx(
        Styles.message,
        message.role === "user" && Styles.messageUser,
      )}
    >
      {message.message}
    </Text>
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

const FeedbackButton = ({
  disabled,
  icon,
  onClick,
  hasBeenClicked,
  ...props
}: {
  disabled: boolean;
  icon: IconName;
  onClick: () => void;
  hasBeenClicked: boolean;
}) => (
  <ActionIcon onClick={onClick} disabled={disabled} h="sm" {...props}>
    <Icon
      name={icon}
      size="1rem"
      c={hasBeenClicked ? "brand" : "currentColor"}
    />
  </ActionIcon>
);

interface AgentMessageProps extends BaseMessageProps {
  onRetry: (messageId: string) => void;
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
}: AgentMessageProps) => (
  <MessageContainer chatRole={message.role} {...props}>
    <AIMarkdown
      className={Styles.message}
      onInternalLinkClick={onInternalLinkClick}
    >
      {message.message}
    </AIMarkdown>

    <Flex className={Styles.messageActions}>
      {!hideActions && (
        <>
          <ActionIcon
            h="sm"
            data-testid="metabot-chat-message-copy"
            onClick={() => onCopy(message.id)}
          >
            <Icon name="copy" size="1rem" />
          </ActionIcon>
          {showFeedbackButtons && setFeedbackMessage && (
            <>
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
            </>
          )}

          <ActionIcon
            onClick={() => onRetry(message.id)}
            h="sm"
            data-testid="metabot-chat-message-retry"
          >
            <Icon name="revert" size="1rem" />
          </ActionIcon>
        </>
      )}
    </Flex>
  </MessageContainer>
);

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
  onRetryMessage: (messageId: string) => void;
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
      clipboard.copy(allMessages.map((msg) => msg.message).join("\n\n"));
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
            key={"msg-" + index}
            data-testid="metabot-chat-message"
            message={message}
            onRetry={onRetryMessage}
            onCopy={onAgentMessageCopy}
            showFeedbackButtons={showFeedbackButtons}
            setFeedbackMessage={setFeedbackModal}
            submittedFeedback={feedbackState.submitted[message.id]}
            hideActions={messages[index + 1]?.role === "agent"}
            onInternalLinkClick={onInternalLinkClick}
          />
        ) : (
          <UserMessage
            key={"msg-" + index}
            data-testid="metabot-chat-message"
            message={message}
            hideActions={isDoingScience && messages.length === index + 1}
            onCopy={() => clipboard.copy(message.message)}
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
