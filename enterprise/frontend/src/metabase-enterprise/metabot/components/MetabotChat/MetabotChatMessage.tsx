import { useClipboard } from "@mantine/hooks";
import cx from "classnames";

import { ActionIcon, Flex, type FlexProps, Icon, Text } from "metabase/ui";
import type {
  MetabotChatMessage,
  MetabotErrorMessage,
} from "metabase-enterprise/metabot/state";

import { AIMarkdown } from "../AIMarkdown/AIMarkdown";

import Styles from "./MetabotChat.module.css";

interface MessageProps extends FlexProps {
  message: MetabotChatMessage;
  onRetry?: (messageId: string) => void;
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

export const UserMessage = ({
  message,
  className,
  hideActions = false,
  ...props
}: Omit<MessageProps, "onRetry">) => {
  const clipboard = useClipboard();

  return (
    <MessageContainer chatRole={message.role} {...props}>
      <Text
        className={cx(
          Styles.message,
          message.role === "user" && Styles.messageUser,
        )}
      >
        {message.message}
      </Text>
      {!hideActions && (
        <Flex className={Styles.messageActions}>
          <ActionIcon
            onClick={() => clipboard.copy(message.message)}
            h="sm"
            data-testid="metabot-chat-message-copy"
          >
            <Icon name="copy" size="1rem" />
          </ActionIcon>
        </Flex>
      )}
    </MessageContainer>
  );
};

export const AgentMessage = ({
  message,
  className,
  onRetry,
  hideActions = false,
  ...props
}: MessageProps) => {
  const clipboard = useClipboard();

  return (
    <MessageContainer chatRole={message.role} {...props}>
      <AIMarkdown className={Styles.message}>{message.message}</AIMarkdown>
      {!hideActions && (
        <Flex className={Styles.messageActions}>
          <ActionIcon
            onClick={() => clipboard.copy(message.message)}
            h="sm"
            data-testid="metabot-chat-message-copy"
          >
            <Icon name="copy" size="1rem" />
          </ActionIcon>
          {onRetry && (
            <ActionIcon
              onClick={() => onRetry(message.id)}
              h="sm"
              data-testid="metabot-chat-message-retry"
            >
              <Icon name="revert" size="1rem" />
            </ActionIcon>
          )}
        </Flex>
      )}
    </MessageContainer>
  );
};

export const Message = (props: MessageProps) => {
  return props.message.role === "agent" ? (
    <AgentMessage {...props} />
  ) : (
    <UserMessage {...props} />
  );
};

export const AgentErrorMessage = ({
  message,
  className,
  ...props
}: FlexProps & {
  message: MetabotErrorMessage;
}) => {
  return (
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
};
