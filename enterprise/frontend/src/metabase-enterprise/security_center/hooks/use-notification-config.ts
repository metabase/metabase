import { useCallback, useState } from "react";

import {
  useGetChannelInfoQuery,
  useListUserRecipientsQuery,
} from "metabase/api";
import type {
  ChannelApiResponse,
  NotificationHandlerEmail,
  NotificationHandlerSlack,
  User,
} from "metabase-types/api";

export interface NotificationConfig {
  email: {
    sendToAllAdmins: boolean;
    handler: NotificationHandlerEmail;
  };
  slack: {
    enabled: boolean;
    handler: NotificationHandlerSlack;
  };
}

const DEFAULT_EMAIL_HANDLER: NotificationHandlerEmail = {
  channel_type: "channel/email",
  recipients: [],
};

const DEFAULT_SLACK_HANDLER: NotificationHandlerSlack = {
  channel_type: "channel/slack",
  recipients: [],
};

const DEFAULT_CONFIG: NotificationConfig = {
  email: {
    sendToAllAdmins: true,
    handler: DEFAULT_EMAIL_HANDLER,
  },
  slack: {
    enabled: false,
    handler: DEFAULT_SLACK_HANDLER,
  },
};

/**
 * Hook for notification channel configuration.
 * TODO: replace save with RTK Query endpoint (e.g. PUT /api/ee/security-center/notification-config)
 */
export function useNotificationConfig() {
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);

  const { data: userRecipients } = useListUserRecipientsQuery();
  const { data: channelInfo } = useGetChannelInfoQuery();

  const users: User[] = userRecipients?.data ?? [];
  const channels: ChannelApiResponse["channels"] | undefined =
    channelInfo?.channels;

  const updateEmailHandler = useCallback(
    (handler: NotificationHandlerEmail) => {
      setConfig((prev) => ({
        ...prev,
        email: { ...prev.email, handler },
      }));
    },
    [],
  );

  const toggleSendToAllAdmins = useCallback((sendToAllAdmins: boolean) => {
    setConfig((prev) => ({
      ...prev,
      email: { ...prev.email, sendToAllAdmins },
    }));
  }, []);

  const updateSlackHandler = useCallback(
    (handler: NotificationHandlerSlack) => {
      setConfig((prev) => ({
        ...prev,
        slack: { ...prev.slack, handler },
      }));
    },
    [],
  );

  const toggleSlack = useCallback((enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      slack: { ...prev.slack, enabled },
    }));
  }, []);

  // TODO: replace with PUT /api/ee/security-center/notification-config
  const save = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, []);

  return {
    config,
    users,
    channels,
    updateEmailHandler,
    toggleSendToAllAdmins,
    updateSlackHandler,
    toggleSlack,
    save,
  };
}
