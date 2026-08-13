import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Button, Flex, Icon, Text } from "metabase/ui";

import S from "./MetabotLongChatNotice.module.css";

interface MetabotLongChatNoticeProps {
  variant: "warning" | "full";
  className?: string;
  onNewChat: () => void;
}

export const MetabotLongChatNotice = ({
  variant,
  className,
  onNewChat,
}: MetabotLongChatNoticeProps) => {
  const [dismissedWarning, setDismissedWarning] = useState(false);

  if (variant === "warning" && dismissedWarning) {
    return null;
  }

  return (
    <Flex
      className={cx(S.notice, className)}
      align="center"
      gap="sm"
      data-testid="metabot-long-chat-notice"
    >
      <Text fz="sm" c="text-secondary" fw="bold" lh="1rem" flex={1}>
        {variant === "full"
          ? t`Your chat is too long`
          : t`Your chat is too long and may stop abruptly`}
      </Text>
      <Button
        variant="subtle"
        size="compact-sm"
        onClick={onNewChat}
        fz="sm"
        data-testid="metabot-long-chat-new-chat"
      >{t`Start a new chat`}</Button>
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
