import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { downloadObjectAsJson } from "metabase/lib/download";
import {
  ActionIcon,
  Collapse,
  Flex,
  type FlexProps,
  Group,
  Icon,
  type IconName,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import { RingProgress } from "metabase/ui";
import type {
  MetabotAgentChatMessage,
  MetabotAgentTextChatMessage,
  MetabotChatMessage,
  MetabotErrorMessage,
  MetabotUserChatMessage,
} from "metabase-enterprise/metabot/state";
import type { MetabotFeedback, MetabotTodoItem } from "metabase-types/api";

import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
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

interface AgentMessageProps extends Omit<BaseMessageProps, "message"> {
  message: MetabotAgentChatMessage;
  onRetry: (messageId: string) => void;
  onCopy: (messageId: string) => void;
  showFeedbackButtons: boolean;
  setFeedbackMessage?: (data: { messageId: string; positive: boolean }) => void;
  submittedFeedback: "positive" | "negative" | undefined;
  onInternalLinkClick?: (link: string) => void;
}

type TodoStatusConfig = {
  icon: IconName;
  iconColor: string;
  color: string;
  td?: string;
};

const todoStatusConfig: Record<MetabotTodoItem["status"], TodoStatusConfig> = {
  completed: { icon: "check", iconColor: "success", color: "text-secondary" },
  in_progress: { icon: "play", iconColor: "brand", color: "text-primary" },
  cancelled: {
    icon: "close",
    iconColor: "text-light",
    td: "line-through",
    color: "text-secondary",
  },
  // TODO: Fix circle
  pending: {
    icon: "circle" as IconName,
    iconColor: "text-medium",
    color: "text-primary",
  },
};

const AgentTodoListMessage = ({ todos }: { todos: MetabotTodoItem[] }) => {
  const [opened, { toggle }] = useDisclosure(true);

  return (
    <Paper
      shadow="none"
      radius="md"
      // eslint-disable-next-line no-color-literals
      bg="rgba(5, 114, 210, 0.07)"
      // eslint-disable-next-line no-color-literals
      style={{ border: `1px solid rgba(5, 114, 210, 0.69)` }}
      py="md"
      px="1.25rem"
    >
      <Group align="center" justify="space-between" onClick={toggle}>
        {/* eslint-disable-next-line no-color-literals */}
        <Text fw="bold" c="rgba(5, 114, 210, 0.69)">{t`Todos`}</Text>
        <Flex align="center" justify="center" h="md" w="md">
          <Icon
            name={opened ? "chevrondown" : "chevronup"}
            size=".75rem"
            // eslint-disable-next-line no-color-literals
            c="rgba(5, 114, 210, 0.69)"
          />
        </Flex>
      </Group>

      <Collapse in={opened} pt="md" pb="sm">
        <Stack gap="md" w="100%">
          {todos.map((todo) => {
            const config = todoStatusConfig[todo.status];

            return (
              <Flex
                key={todo.id}
                style={{ borderRadius: "2px" }}
                align="flex-start"
              >
                {match(todo.status)
                  .with("pending", () => (
                    <RingProgress
                      size={28}
                      ml="-2px"
                      mr=".25rem"
                      thickness={1.5}
                      sections={[{ value: 0, color: "white" }]}
                      // eslint-disable-next-line no-color-literals
                      rootColor="rgba(5, 114, 210, 0.45)"
                    />
                  ))
                  .with("completed", () => (
                    <Flex
                      h="1.5rem"
                      w="1.5rem"
                      // eslint-disable-next-line no-color-literals
                      bg="rgba(5, 114, 210, 0.69)"
                      style={{ borderRadius: "50%", flexShrink: 0 }}
                      align="center"
                      justify="center"
                      mr=".4rem"
                    >
                      <Icon name="check" size="1rem" c="white" />
                    </Flex>
                  ))
                  .with("in_progress", () => (
                    <RingProgress
                      size={30}
                      ml="-3px"
                      mr="xs"
                      thickness={3}
                      sections={[
                        // eslint-disable-next-line no-color-literals
                        { value: 70, color: "rgba(5, 114, 210, 0.82)" },
                      ]}
                      // eslint-disable-next-line no-color-literals
                      rootColor="rgba(5, 114, 210, 0.45)"
                    />
                  ))
                  .with("cancelled", () => (
                    <Flex
                      h="1.5rem"
                      w="1.5rem"
                      // eslint-disable-next-line no-color-literals
                      bg="rgba(5, 114, 210, 0.69)"
                      style={{ borderRadius: "50%", flexShrink: 0 }}
                      align="center"
                      justify="center"
                      mr="sm"
                    >
                      <Icon name="close" size="1rem" c="white" />
                    </Flex>
                  ))
                  .exhaustive()}
                <Text
                  lh={1.2}
                  size="md"
                  mt=".4rem"
                  td={config.td}
                  c={config.color}
                >
                  {todo.content}
                </Text>
              </Flex>
            );
          })}
        </Stack>
      </Collapse>
    </Paper>
  );
};

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

  const submitFeedback = async (metabotFeedback: MetabotFeedback) => {
    const { message_id, positive } = metabotFeedback.feedback;

    downloadObjectAsJson(metabotFeedback, `metabot-feedback-${message_id}`);
    sendToast({ icon: "check", message: "Feedback downloaded successfully" });

    setFeedbackState((prevState) => ({
      submitted: {
        ...prevState.submitted,
        [message_id]: positive ? "positive" : "negative",
      },
      modal: undefined,
    }));
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
