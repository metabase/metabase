import { unifiedMergeView } from "@codemirror/merge";
import { useClipboard, useDisclosure } from "@mantine/hooks";
import type { UnknownAction } from "@reduxjs/toolkit";
import cx from "classnames";
import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useToast } from "metabase/common/hooks";
import { downloadObjectAsJson } from "metabase/lib/download";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import EditorS from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css";
import {
  ActionIcon,
  Button,
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
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import {
  type MetabotAgentChatMessage,
  type MetabotAgentEditSuggestionChatMessage,
  type MetabotAgentTextChatMessage,
  type MetabotChatMessage,
  type MetabotErrorMessage,
  type MetabotUserChatMessage,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type {
  DatasetQuery,
  MetabotFeedback,
  MetabotTodoItem,
  Transform,
} from "metabase-types/api";

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
      <Text className={cx(Styles.message, Styles.messageUser)}>
        {message.message}
      </Text>
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

const AgentSuggestionMessage = ({
  message,
}: {
  message: MetabotAgentEditSuggestionChatMessage;
}) => {
  const dispatch = useDispatch();

  // TODO: dispatch the action directly to avoid overhead of this entire hook
  const metabot = useMetabotAgent();

  const transform = message.payload;

  // TODO: handle loading/error states
  const { data: originalTransform } = useGetTransformQuery(
    transform.id ?? skipToken,
  );
  // TODO: handle loading/error states
  const [updateTransform] = useUpdateTransformMutation();

  const [opened, { toggle }] = useDisclosure(true);

  function getSourceCode(transform: Pick<Transform, "source">): string {
    return match(transform)
      .with(
        { source: { type: "query", query: { type: "native" } } },
        (t) => t.source.query.native.query,
      )
      .otherwise(() => "");
  }

  const oldSource = originalTransform ? getSourceCode(originalTransform) : "";
  const newSource = getSourceCode(transform);

  const url = useLocation();
  const isViewing = url.pathname?.startsWith(
    `/admin/transforms/${transform.id}/query`,
  );

  const handleFocus = () => {
    const url = transform.id
      ? `/admin/transforms/${transform.id}/query`
      : "/admin/transforms/new/native";
    dispatch(push(url) as UnknownAction);
    dispatch(setSuggestedTransform(transform));
  };

  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const handleSave = async (query: DatasetQuery) => {
    if (transform.id) {
      const { error } = await updateTransform({
        id: transform.id,
        source: {
          type: "query",
          query,
        },
      });

      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);
      }
    } else {
      // console.log("TODO");
    }
  };

  const handleAccept = async () => {
    if (!isViewing && !transform.id) {
      handleFocus();
    }

    if (transform.id) {
      await handleSave(transform.source.query);
      metabot.submitInput({
        type: "action",
        message:
          "HIDDEN MESSAGE: user has accepted your changes, move to the next step!",
        // @ts-expect-error -- TODO
        userMessage: "✅ You accepted the change",
      });
    }
  };
  const handleReject = () => {
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput({
      type: "action",
      message:
        "HIDDEN MESSAGE: the user has rejected your changes, ask for clarification on what they'd like to do instead.",
      // @ts-expect-error -- TODO
      userMessage: "❌ You rejected the change",
    });
  };

  return (
    <Paper
      shadow="none"
      radius="md"
      bg="white"
      style={{ border: `1px solid var(--mb-color-border)` }}
    >
      <Group
        p="md"
        align="center"
        justify="space-between"
        onClick={toggle}
        style={{ borderBottom: `1px solid var(--mb-color-border)` }}
      >
        <Flex align="center" gap="sm">
          <Icon name="refresh_downstream" size="1rem" c="text-secondary" />
          <Text size="sm">{transform.name}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Text size="sm" c={transform.id ? "success" : "new"}>
            {transform.id ? t`Change` : t`New`}
          </Text>
          <Flex align="center" justify="center" h="md" w="md">
            <Icon name={opened ? "chevrondown" : "chevronup"} size=".75rem" />
          </Flex>
        </Flex>
      </Group>

      <Collapse
        in={opened}
        transitionDuration={0}
        transitionTimingFunction="linear"
      >
        <CodeMirror
          className={EditorS.editor}
          extensions={
            transform.id
              ? [
                  unifiedMergeView({
                    original: oldSource,
                    mergeControls: false,
                    collapseUnchanged: {
                      margin: 3,
                      minSize: 4,
                    },
                  }),
                ]
              : undefined
          }
          value={newSource}
          readOnly
          autoCorrect="off"
        />
      </Collapse>

      <Group
        py="xs"
        px="sm"
        align="center"
        justify="space-between"
        style={{ borderTop: opened ? `1px solid var(--mb-color-border)` : "" }}
      >
        <Flex align="center" gap="sm">
          <Button
            size="compact-xs"
            disabled={isViewing}
            variant="subtle"
            fw="normal"
            fz="sm"
            c={isViewing ? "text-lighter" : "text-secondary"}
            onClick={handleFocus}
          >
            {isViewing ? t`Focused` : t`Focus`}
          </Button>
        </Flex>

        <Flex align="center" gap="sm">
          <Button
            size="compact-xs"
            variant="subtle"
            fw="normal"
            fz="sm"
            c="success"
            onClick={handleAccept}
          >{t`Accept`}</Button>
          <Button
            size="compact-xs"
            variant="subtle"
            fw="normal"
            fz="sm"
            c="danger"
            onClick={handleReject}
          >{t`Reject`}</Button>
        </Flex>
      </Group>
    </Paper>
  );
};

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
              // TODO: probably want to make this not show up long-term
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
