import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";

import { ActionIcon, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";

import S from "./MetabotLongChatNotice.module.css";

interface MetabotLongChatNoticeProps {
  variant: "warning" | "full";
  className?: string;
  onNewChat: () => void;
}

const ContextLimitTerm = () => (
  <Tooltip
    label={t`Once a chat reaches the context limit, the chat will stop. Currently, you can't compact context to continue a chat. You'll need to start a new chat with a new prompt.`}
    multiline
    w={280}
  >
    <Text
      component="span"
      className={S.term}
      data-testid="metabot-long-chat-context-limit"
    >
      {t`context limit`}
    </Text>
  </Tooltip>
);

export const MetabotLongChatNotice = ({
  variant,
  className,
  onNewChat,
}: MetabotLongChatNoticeProps) => {
  const [dismissedWarning, setDismissedWarning] = useState(false);

  if (variant === "warning" && dismissedWarning) {
    return null;
  }

  const contextLimit = <ContextLimitTerm key="context-limit" />;

  return (
    <Flex
      className={cx(S.notice, className)}
      align="center"
      gap="sm"
      data-testid="metabot-long-chat-notice"
    >
      <Text lh="1rem" flex={1}>
        {variant === "full"
          ? c("{0} is the term “context limit”")
              .jt`This chat has reached the ${contextLimit}.`
          : c("{0} is the term “context limit”")
              .jt`This chat is nearing the ${contextLimit}.`}
      </Text>
      <Button
        variant="subtle"
        size="compact-sm"
        onClick={onNewChat}
        fw="bold"
        data-testid="metabot-long-chat-new-chat"
      >{t`New chat`}</Button>
      {variant === "warning" && (
        <ActionIcon
          size="sm"
          c="text-secondary"
          onClick={() => setDismissedWarning(true)}
          aria-label={t`Dismiss`}
          data-testid="metabot-long-chat-dismiss"
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      )}
    </Flex>
  );
};
